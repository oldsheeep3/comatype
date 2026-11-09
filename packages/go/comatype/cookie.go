package comatype

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"
)

// CookieDef is the `cookie <name> { ... }` of init.comat.
type CookieDef struct {
	Name     string
	HTTPOnly bool
	Secure   bool
	SameSite string // lax | strict | none
	Path     string
	Domain   string
	MaxAge   *int // seconds
}

// CookieValue is a cookie to issue.
type CookieValue struct {
	Value   string
	Delete  bool
	MaxAge  *int
	Expires time.Time
	Path    string
	Domain  string
}

type CookieOption func(*CookieValue)

func MaxAge(seconds int) CookieOption    { return func(c *CookieValue) { c.MaxAge = &seconds } }
func Expires(t time.Time) CookieOption   { return func(c *CookieValue) { c.Expires = t } }
func CookiePath(p string) CookieOption   { return func(c *CookieValue) { c.Path = p } }
func CookieDomain(d string) CookieOption { return func(c *CookieValue) { c.Domain = d } }

const epoch = "Thu, 01 Jan 1970 00:00:00 GMT"

func attr(what, v string) (string, error) {
	if strings.ContainsAny(v, ";\r\n") {
		return "", fmt.Errorf("cookie の %s に使えない文字があります: %q", what, v)
	}
	return v, nil
}

// SerializeSetCookie builds a Set-Cookie value. Attributes (HttpOnly etc.) come from init.comat.
func SerializeSetCookie(def *CookieDef, v *CookieValue) (string, error) {
	if def == nil {
		return "", errors.New("このエンドポイントは cookie を発行できません（cookie off、または init.comat に cookie の宣言がありません）")
	}
	val := v.Value
	if v.Delete {
		val = ""
	}
	parts := []string{def.Name + "=" + url.QueryEscape(val)}
	parts[0] = def.Name + "=" + strings.ReplaceAll(url.QueryEscape(val), "+", "%20")
	path := def.Path
	if v.Path != "" {
		path = v.Path
	}
	if path == "" {
		path = "/"
	}
	p, err := attr("path", path)
	if err != nil {
		return "", err
	}
	parts = append(parts, "Path="+p)
	domain := def.Domain
	if v.Domain != "" {
		domain = v.Domain
	}
	if domain != "" {
		d, err := attr("domain", domain)
		if err != nil {
			return "", err
		}
		parts = append(parts, "Domain="+d)
	}
	if v.Delete {
		parts = append(parts, "Max-Age=0", "Expires="+epoch)
	} else {
		maxAge := def.MaxAge
		if v.MaxAge != nil {
			maxAge = v.MaxAge
		}
		if maxAge != nil {
			if *maxAge < 0 {
				return "", fmt.Errorf("cookie の maxAge が不正です: %d", *maxAge)
			}
			parts = append(parts, fmt.Sprintf("Max-Age=%d", *maxAge))
		}
		if !v.Expires.IsZero() {
			parts = append(parts, "Expires="+v.Expires.UTC().Format(time.RFC1123))
			parts[len(parts)-1] = strings.Replace(parts[len(parts)-1], "UTC", "GMT", 1)
		}
	}
	if def.HTTPOnly {
		parts = append(parts, "HttpOnly")
	}
	if def.Secure {
		parts = append(parts, "Secure")
	}
	if def.SameSite != "" {
		parts = append(parts, "SameSite="+strings.ToUpper(def.SameSite[:1])+def.SameSite[1:])
	}
	return strings.Join(parts, "; "), nil
}

// CookieJar is a jar for HTTP clients that do not keep cookies themselves.
// Assuming the API is a single origin, Domain is ignored and only Path and expiry are checked.
type CookieJar struct {
	mu  sync.Mutex
	now func() time.Time
	m   map[string]storedCookie
}

type storedCookie struct {
	value   string
	path    string
	expires time.Time // zero value means a session cookie
}

func NewCookieJar() *CookieJar {
	return &CookieJar{now: time.Now, m: map[string]storedCookie{}}
}

// Get returns the cookies to send for this path.
func (j *CookieJar) Get(path string) map[string]string {
	j.mu.Lock()
	defer j.mu.Unlock()
	out := map[string]string{}
	for name, c := range j.m {
		if !c.expires.IsZero() && !c.expires.After(j.now()) {
			delete(j.m, name)
			continue
		}
		prefix := c.path
		if !strings.HasSuffix(prefix, "/") {
			prefix += "/"
		}
		if c.path == "/" || path == c.path || strings.HasPrefix(path, prefix) {
			out[name] = c.value
		}
	}
	return out
}

// Store takes in the response's Set-Cookie (Max-Age=0 / expired entries are deleted).
func (j *CookieJar) Store(lines []string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	for _, line := range lines {
		segs := strings.Split(line, ";")
		name, value, ok := strings.Cut(strings.TrimSpace(segs[0]), "=")
		if !ok || name == "" {
			continue
		}
		if dec, err := url.PathUnescape(value); err == nil {
			value = dec
		}
		c := storedCookie{value: value, path: "/"}
		var maxAge *int
		for _, a := range segs[1:] {
			k, v, _ := strings.Cut(strings.TrimSpace(a), "=")
			switch strings.ToLower(k) {
			case "path":
				if strings.HasPrefix(v, "/") {
					c.path = v
				}
			case "max-age":
				var n int
				if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
					maxAge = &n
				}
			case "expires":
				if t, err := time.Parse(time.RFC1123, v); err == nil {
					c.expires = t
				}
			}
		}
		if maxAge != nil { // Max-Age takes precedence over Expires
			c.expires = j.now().Add(time.Duration(*maxAge) * time.Second)
		}
		if !c.expires.IsZero() && !c.expires.After(j.now()) {
			delete(j.m, name)
		} else {
			j.m[name] = c
		}
	}
}

func (j *CookieJar) Clear() {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.m = map[string]storedCookie{}
}

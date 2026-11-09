package comatype

import (
	"encoding/base64"
	"hash/fnv"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// CacheSpec is the `cache` setting of `.comat` (GET / QUERY endpoints only).
type CacheSpec struct {
	// Mode is "off" (never cache) / "memory" (in memory for the TTL) / "cookie" (in a cookie for the TTL; client only)
	Mode string
	// TTLMillis is in milliseconds
	TTLMillis int64
}

// CacheCookiePrefix is the name prefix of cache cookies. The client does not send cookies with this prefix back to the server.
const CacheCookiePrefix = "comatype_cache_"

// CacheCookieMax is the maximum value length of one cookie. Larger responses are not cached in a cookie.
const CacheCookieMax = 3800

// Memory reports whether this is cached in memory for the ttl.
func (c *CacheSpec) Memory() bool { return c != nil && c.Mode == "memory" && c.TTLMillis > 0 }

// Cookie reports whether this is cached in a cookie.
func (c *CacheSpec) Cookie() bool { return c != nil && c.Mode == "cookie" && c.TTLMillis > 0 }

// MemoryCache is an in-memory cache with TTL (expired entries are dropped on lookup; over the size limit, the oldest are dropped).
type MemoryCache struct {
	mu    sync.Mutex
	max   int
	now   func() time.Time
	m     map[string]cacheEntry
	order []string
}

type cacheEntry struct {
	res     RawResponse
	expires time.Time
}

func NewMemoryCache(max int) *MemoryCache {
	return &MemoryCache{max: max, now: time.Now, m: map[string]cacheEntry{}}
}

func cloneResponse(r RawResponse) RawResponse {
	out := RawResponse{Status: r.Status, Header: r.Header.Clone(), Body: append([]byte(nil), r.Body...)}
	if out.Header == nil {
		out.Header = http.Header{}
	}
	return out
}

func (c *MemoryCache) Get(key string) (RawResponse, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok {
		return RawResponse{}, false
	}
	if !e.expires.After(c.now()) {
		delete(c.m, key)
		return RawResponse{}, false
	}
	return cloneResponse(e.res), true
}

func (c *MemoryCache) Set(key string, r RawResponse, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.m[key]; !ok {
		c.order = append(c.order, key)
	}
	c.m[key] = cacheEntry{res: cloneResponse(r), expires: c.now().Add(ttl)}
	for len(c.m) > c.max && len(c.order) > 0 {
		delete(c.m, c.order[0])
		c.order = c.order[1:]
	}
}

func (c *MemoryCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m = map[string]cacheEntry{}
	c.order = nil
}

func (c *MemoryCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.m)
}

// Cacheable reports whether a response may be cached (2xx, without Set-Cookie).
func Cacheable(r RawResponse) bool {
	return r.Status >= 200 && r.Status < 300 && len(r.SetCookies) == 0
}

// ClientCacheKey is the client cache key: method, URL (path and query) and body, plus the request headers declared in `.comat`.
// Headers added by wrappers or Config (Authorization etc.) are not included.
func ClientCacheKey(method, url string, body []byte, declared []string, h http.Header) string {
	names := make([]string, 0, len(declared))
	for _, n := range declared {
		names = append(names, http.CanonicalHeaderKey(n))
	}
	sort.Strings(names)
	var b strings.Builder
	b.WriteString(method + "\n" + url + "\n")
	for _, n := range names {
		b.WriteString(strings.ToLower(n) + ":" + strings.Join(h.Values(n), ", ") + "\n")
	}
	b.WriteString("\n")
	b.Write(body)
	return b.String()
}

// ServerCacheKey is the server cache key: an exact match of the request (method, path, query, all headers, body).
func ServerCacheKey(method, target string, h http.Header, body []byte) string {
	names := make([]string, 0, len(h))
	for n := range h {
		names = append(names, n)
	}
	sort.Strings(names)
	var b strings.Builder
	b.WriteString(method + "\n" + target + "\n")
	for _, n := range names {
		b.WriteString(strings.ToLower(n) + ":" + strings.Join(h[n], ", ") + "\n")
	}
	b.WriteString("\n")
	b.Write(body)
	return b.String()
}

// CacheCookieName derives a cookie name from the key (FNV-1a 64-bit).
func CacheCookieName(key string) string {
	h := fnv.New64a()
	_, _ = h.Write([]byte(key))
	s := strconv.FormatUint(h.Sum64(), 16)
	return CacheCookiePrefix + strings.Repeat("0", 16-len(s)) + s
}

// EncodeCacheCookie turns a response into a cookie value (base64url of `status\nname\tvalue\n...\n\nbody`). ok is false if it is too large.
func EncodeCacheCookie(r RawResponse) (string, bool) {
	var b strings.Builder
	b.WriteString(strconv.Itoa(r.Status) + "\n")
	names := make([]string, 0, len(r.Header))
	for n := range r.Header {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		for _, v := range r.Header[n] {
			b.WriteString(n + "\t" + v + "\n")
		}
	}
	b.WriteString("\n")
	b.Write(r.Body)
	v := base64.RawURLEncoding.EncodeToString([]byte(b.String()))
	return v, len(v) <= CacheCookieMax
}

// DecodeCacheCookie is the inverse of EncodeCacheCookie.
func DecodeCacheCookie(v string) (RawResponse, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(v)
	if err != nil {
		return RawResponse{}, false
	}
	head, body, ok := strings.Cut(string(raw), "\n\n")
	if !ok {
		return RawResponse{}, false
	}
	lines := strings.Split(head, "\n")
	status, err := strconv.Atoi(lines[0])
	if err != nil {
		return RawResponse{}, false
	}
	out := RawResponse{Status: status, Header: http.Header{}, Body: []byte(body)}
	for _, l := range lines[1:] {
		if k, val, ok := strings.Cut(l, "\t"); ok {
			out.Header.Add(k, val)
		}
	}
	return out, true
}

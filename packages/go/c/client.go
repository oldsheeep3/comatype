// Package c is the Go client.
package c

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/oldsheeep3/comatype/packages/go/comatype"
)

// Ptr is a helper for passing a value to an optional (pointer) field.
func Ptr[T any](v T) *T { return &v }

type (
	RawRequest  = comatype.RawRequest
	RawResponse = comatype.RawResponse
)

// Next calls the next wrapper (the last one does the request).
type Next func(req *RawRequest) (*RawResponse, error)

// ComatypeWrap is a wrapper implementation. It can rewrite both the request and the response. One per `wrapper <name>` in init.comat.
type ComatypeWrap func(req *RawRequest, next Next) (*RawResponse, error)

// WrapperSet is implemented by the Wrappers struct of the generated init package.
type WrapperSet interface {
	ComatypeWrappers() map[string]ComatypeWrap
}

type Config struct {
	// BaseURL precedence: this field > env COMATYPE_BASE_URL > baseUrl in init.comat
	BaseURL string
	// Wrappers is comatype_init.Wrappers{...}. An endpoint that uses a missing (nil) wrapper returns an error
	Wrappers WrapperSet
	// With a CookieJar, `cookie on` endpoints keep Set-Cookie and send it back
	CookieJar  *comatype.CookieJar
	HTTPClient *http.Client
	// Header is added to every request
	Header http.Header
}

var (
	mu       sync.RWMutex
	cfg      Config
	wrappers map[string]ComatypeWrap
	// memCache holds responses of `cache <ttl>` (memory) endpoints
	memCache = comatype.NewMemoryCache(1000)
	// cacheCookies holds the names of cookies carrying cached responses (for ClearCache)
	cacheCookies = map[string]bool{}
)

// ClearCache drops the cache (memory and what is stored in the cookie jar), e.g. on logout.
func ClearCache() {
	memCache.Clear()
	mu.Lock()
	defer mu.Unlock()
	if cfg.CookieJar != nil {
		for name := range cacheCookies {
			cfg.CookieJar.Store([]string{name + "=; Path=/; Max-Age=0"})
		}
	}
	cacheCookies = map[string]bool{}
}

// Init is called once at startup.
func Init(c Config) {
	mu.Lock()
	defer mu.Unlock()
	cfg = c
	wrappers = nil
	if c.Wrappers != nil {
		wrappers = c.Wrappers.ComatypeWrappers()
	}
}

// The Arg type depends on the shape of the request.
//   Request if there are params / search, Body if only a body, no argument otherwise (can be omitted).

func Get[Arg, Req, Res any](ctx context.Context, ep *comatype.Endpoint[Arg, Req, Res], arg ...Arg) (*Res, error) {
	return do(ctx, "get", ep, arg)
}
func Post[Arg, Req, Res any](ctx context.Context, ep *comatype.Endpoint[Arg, Req, Res], arg ...Arg) (*Res, error) {
	return do(ctx, "post", ep, arg)
}
func Put[Arg, Req, Res any](ctx context.Context, ep *comatype.Endpoint[Arg, Req, Res], arg ...Arg) (*Res, error) {
	return do(ctx, "put", ep, arg)
}
func Patch[Arg, Req, Res any](ctx context.Context, ep *comatype.Endpoint[Arg, Req, Res], arg ...Arg) (*Res, error) {
	return do(ctx, "patch", ep, arg)
}
func Delete[Arg, Req, Res any](ctx context.Context, ep *comatype.Endpoint[Arg, Req, Res], arg ...Arg) (*Res, error) {
	return do(ctx, "delete", ep, arg)
}
func Options[Arg, Req, Res any](ctx context.Context, ep *comatype.Endpoint[Arg, Req, Res], arg ...Arg) (*Res, error) {
	return do(ctx, "options", ep, arg)
}
func Query[Arg, Req, Res any](ctx context.Context, ep *comatype.Endpoint[Arg, Req, Res], arg ...Arg) (*Res, error) {
	return do(ctx, "query", ep, arg)
}
func Head[Arg, Req, Res any](ctx context.Context, ep *comatype.Endpoint[Arg, Req, Res], arg ...Arg) (*Res, error) {
	return do(ctx, "head", ep, arg)
}

func do[Arg, Req, Res any](ctx context.Context, method string, ep *comatype.Endpoint[Arg, Req, Res], args []Arg) (*Res, error) {
	if ep.Method != method {
		return nil, fmt.Errorf("c.%s() に %s のエンドポイント（%s）は渡せません", strings.Title(method), ep.Method, ep.Module) //nolint:staticcheck
	}
	if ep.BuildRequest == nil || ep.ParseResponse == nil {
		return nil, fmt.Errorf("%s はクライアント用に生成されていません（role: client で生成してください）", ep.Module)
	}
	if len(args) > 1 {
		return nil, errors.New("リクエストの引数が多すぎます")
	}
	mu.RLock()
	conf, ws := cfg, wrappers
	mu.RUnlock()

	chain := make([]ComatypeWrap, 0, len(ep.Wraps))
	for _, name := range ep.Wraps {
		w := ws[name]
		if w == nil {
			return nil, fmt.Errorf("ラッパー %s が Init に渡されていません（%s）", name, ep.Module)
		}
		chain = append(chain, w)
	}

	var arg Arg
	if len(args) == 1 {
		arg = args[0]
	}
	raw, err := ep.BuildRequest(arg)
	if err != nil {
		return nil, err
	}
	raw.Context = ctx
	for k, vs := range conf.Header {
		if _, ok := raw.Header[http.CanonicalHeaderKey(k)]; !ok {
			raw.Header[http.CanonicalHeaderKey(k)] = append([]string(nil), vs...)
		}
	}
	if raw.Header.Get("Accept") == "" {
		raw.Header.Set("Accept", "application/json")
	}
	if ep.Cookie && conf.CookieJar != nil {
		for k, v := range conf.CookieJar.Get(raw.Path) {
			if !strings.HasPrefix(k, comatype.CacheCookiePrefix) { // do not send cache cookies back
				raw.Cookies[k] = v
			}
		}
	}

	send := func(r *RawRequest) (*RawResponse, error) { return transport(ep, conf, r) }
	next := Next(send)
	for i := len(chain) - 1; i >= 0; i-- {
		w, inner := chain[i], next
		next = func(r *RawRequest) (*RawResponse, error) { return w(r, inner) }
	}
	resp, err := next(raw)
	if err != nil {
		return nil, err
	}
	if resp == nil {
		return nil, fmt.Errorf("ラッパーが nil のレスポンスを返しました（%s）", ep.Module)
	}
	res, err := ep.ParseResponse(resp)
	if err != nil {
		return nil, err
	}
	return &res, nil
}

func transport[Arg, Req, Res any](ep *comatype.Endpoint[Arg, Req, Res], conf Config, r *RawRequest) (*RawResponse, error) {
	base := conf.BaseURL
	if base == "" {
		base = os.Getenv("COMATYPE_BASE_URL")
	}
	if base == "" {
		base = ep.BaseURL
	}
	if base == "" {
		return nil, errors.New("base url がありません（Config.BaseURL、環境変数 COMATYPE_BASE_URL、init.comat の baseUrl のどれかで指定してください）")
	}
	u := strings.TrimRight(base, "/") + r.Path
	if len(r.Query) > 0 {
		u += "?" + r.Query.Encode()
	}
	var body io.Reader
	if len(r.Body) > 0 {
		body = bytes.NewReader(r.Body)
	}
	ctx := r.Context
	if ctx == nil {
		ctx = context.Background()
	}
	req, err := http.NewRequestWithContext(ctx, strings.ToUpper(r.Method), u, body)
	if err != nil {
		return nil, err
	}
	for k, vs := range r.Header {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	if len(r.Cookies) > 0 && req.Header.Get("Cookie") == "" {
		names := make([]string, 0, len(r.Cookies))
		for k := range r.Cookies {
			names = append(names, k)
		}
		sort.Strings(names)
		pairs := make([]string, len(names))
		for i, k := range names {
			pairs[i] = k + "=" + strings.ReplaceAll(escape(r.Cookies[k]), "+", "%20")
		}
		req.Header.Set("Cookie", strings.Join(pairs, "; "))
	}
	// Cache (GET / QUERY): memory or cookie. The key is the method, URL, body and the declared request headers
	var cacheKey string
	switch {
	case ep.Cache.Memory():
		cacheKey = comatype.ClientCacheKey(r.Method, u, r.Body, ep.CacheHeaders, r.Header)
		if hit, ok := memCache.Get(cacheKey); ok {
			return &hit, nil
		}
	case ep.Cache.Cookie() && conf.CookieJar != nil:
		cacheKey = comatype.ClientCacheKey(r.Method, u, r.Body, ep.CacheHeaders, r.Header)
		if v, ok := conf.CookieJar.Get("/")[comatype.CacheCookieName(cacheKey)]; ok {
			if hit, ok := comatype.DecodeCacheCookie(v); ok {
				return &hit, nil
			}
		}
	}
	hc := conf.HTTPClient
	if hc == nil {
		hc = http.DefaultClient
	}
	res, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	out := &RawResponse{Status: res.StatusCode, Header: res.Header, Body: data, SetCookies: res.Header.Values("Set-Cookie")}
	if ep.Cookie && conf.CookieJar != nil && len(out.SetCookies) > 0 {
		conf.CookieJar.Store(out.SetCookies)
	}
	if cacheKey != "" && comatype.Cacheable(*out) {
		ttl := time.Duration(ep.Cache.TTLMillis) * time.Millisecond
		if ep.Cache.Memory() {
			memCache.Set(cacheKey, *out, ttl)
		} else if v, ok := comatype.EncodeCacheCookie(*out); ok {
			name := comatype.CacheCookieName(cacheKey)
			secs := int((ttl + time.Second - 1) / time.Second) // cookie ttl is in seconds (rounded up)
			conf.CookieJar.Store([]string{fmt.Sprintf("%s=%s; Path=/; Max-Age=%d", name, v, secs)})
			mu.Lock()
			cacheCookies[name] = true
			mu.Unlock()
		}
	}
	return out, nil
}

// NewCookieJar creates a jar that keeps cookies (pass it to Config.CookieJar).
func NewCookieJar() *comatype.CookieJar { return comatype.NewCookieJar() }

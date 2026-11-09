// Package s is the Go server. It builds a net/http.Handler.
package s

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/oldsheeep3/comatype/packages/go/comatype"
)

type (
	RawResponse = comatype.RawResponse
	// WrapAdapter is a typed wrapper converted to the untyped form (made by the generated Wrappers)
)

// RawRequest is the request a wrapper sees. Ctx is the value this wrapper adds (the ctx of `wrapper` in init.comat).
type RawRequest[Ctx any] struct {
	*comatype.RawRequest
	Ctx Ctx
}

// Next calls the next wrapper (the last one is the handler).
type Next[Ctx any] func(req *RawRequest[Ctx]) RawResponse

// ComatypeWrap is a wrapper implementation. It can rewrite both the request and the response.
// The req.Ctx passed to next becomes the req.Ctx (typed per wrapper) of later wrappers and the handler.
type ComatypeWrap[Ctx any] func(req *RawRequest[Ctx], next Next[Ctx]) RawResponse

// Adapt converts a typed wrapper to the untyped form (used by the generated Wrappers).
func Adapt[Ctx any](name string, w ComatypeWrap[Ctx]) comatype.ServerWrap {
	if w == nil {
		return nil
	}
	return func(req *comatype.RawRequest, next comatype.ServerNext) comatype.RawResponse {
		typed := &RawRequest[Ctx]{RawRequest: req}
		if v, ok := req.Contexts[name].(Ctx); ok {
			typed.Ctx = v
		}
		return w(typed, func(r *RawRequest[Ctx]) comatype.RawResponse {
			r.RawRequest.Contexts[name] = r.Ctx
			return next(r.RawRequest)
		})
	}
}

// WrapperSet is implemented by the Wrappers struct of the generated init package.
type WrapperSet interface {
	ComatypeWrappers() map[string]comatype.ServerWrap
}

type Config struct {
	// Wrappers is comatype_init.Wrappers{...}. Requests to an endpoint that uses a missing (nil) wrapper get a 500
	Wrappers WrapperSet
	// OnError receives handler/wrapper panics and the causes of responses that do not match .comat. Defaults to logging
	OnError func(err error, r *http.Request)
}

type route struct {
	method  string
	module  string
	segs    []string
	statics int
	wraps   []string
	cache   *comatype.CacheSpec
	handle  func(raw *comatype.RawRequest) comatype.RawResponse
}

var (
	mu       sync.RWMutex
	cfg      Config
	wrappers map[string]comatype.ServerWrap
	routes   []*route
	// memCache holds responses of `cache <ttl>` (memory) endpoints. Hits on an exact request match
	memCache = comatype.NewMemoryCache(1000)
)

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

// Reset drops the registered routes and settings (for tests).
func Reset() {
	mu.Lock()
	defer mu.Unlock()
	cfg, wrappers, routes = Config{}, nil, nil
	memCache.Clear()
}

func Get[Arg, Req, Res any](ep *comatype.Endpoint[Arg, Req, Res], h func(Req) Res) {
	register("get", ep, h)
}
func Post[Arg, Req, Res any](ep *comatype.Endpoint[Arg, Req, Res], h func(Req) Res) {
	register("post", ep, h)
}
func Put[Arg, Req, Res any](ep *comatype.Endpoint[Arg, Req, Res], h func(Req) Res) {
	register("put", ep, h)
}
func Patch[Arg, Req, Res any](ep *comatype.Endpoint[Arg, Req, Res], h func(Req) Res) {
	register("patch", ep, h)
}
func Delete[Arg, Req, Res any](ep *comatype.Endpoint[Arg, Req, Res], h func(Req) Res) {
	register("delete", ep, h)
}
func Options[Arg, Req, Res any](ep *comatype.Endpoint[Arg, Req, Res], h func(Req) Res) {
	register("options", ep, h)
}
func Query[Arg, Req, Res any](ep *comatype.Endpoint[Arg, Req, Res], h func(Req) Res) {
	register("query", ep, h)
}
func Head[Arg, Req, Res any](ep *comatype.Endpoint[Arg, Req, Res], h func(Req) Res) {
	register("head", ep, h)
}

func pathSegs(p string) []string {
	var out []string
	for _, s := range strings.Split(p, "/") {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

func shape(method string, segs []string) string {
	parts := make([]string, len(segs))
	for i, s := range segs {
		if strings.HasPrefix(s, ":") {
			parts[i] = ":"
		} else {
			parts[i] = s
		}
	}
	return method + " /" + strings.Join(parts, "/")
}

func register[Arg, Req, Res any](method string, ep *comatype.Endpoint[Arg, Req, Res], h func(Req) Res) {
	if ep.Method != method {
		panic(fmt.Sprintf("s.%s() に %s のエンドポイント（%s）は渡せません", strings.ToUpper(method[:1])+method[1:], ep.Method, ep.Module))
	}
	if ep.ParseRequest == nil || ep.BuildResponse == nil {
		panic(fmt.Sprintf("%s はサーバ用に生成されていません（role: server で生成してください）", ep.Module))
	}
	r := &route{method: method, module: ep.Module, segs: pathSegs(ep.Path), wraps: ep.Wraps, cache: ep.Cache}
	for _, s := range r.segs {
		if !strings.HasPrefix(s, ":") {
			r.statics++
		}
	}
	r.handle = func(raw *comatype.RawRequest) comatype.RawResponse {
		req, err := ep.ParseRequest(raw)
		if err != nil {
			var ve *comatype.ValidationError
			if asValidation(err, &ve) {
				return comatype.JSONResponse(http.StatusBadRequest, &comatype.ErrorBody{Code: "validation_error", Message: ve.Error(), Path: ve.Path})
			}
			return comatype.ErrorResponse(err)
		}
		res := h(req)
		out, err := ep.BuildResponse(res)
		if err != nil {
			return comatype.ErrorResponse(err)
		}
		return out
	}
	mu.Lock()
	defer mu.Unlock()
	for _, o := range routes {
		if shape(o.method, o.segs) == shape(r.method, r.segs) {
			panic(fmt.Sprintf("%s が重複しています（%s と %s）", shape(r.method, r.segs), o.module, r.module))
		}
	}
	routes = append(routes, r)
}

func find(method string, segs []string) (*route, map[string]string) {
	var best *route
	var bestParams map[string]string
	for _, r := range routes {
		if r.method != method || len(r.segs) != len(segs) {
			continue
		}
		params := map[string]string{}
		ok := true
		for i, want := range r.segs {
			if strings.HasPrefix(want, ":") {
				params[want[1:]] = segs[i]
			} else if want != segs[i] {
				ok = false
				break
			}
		}
		if ok && (best == nil || r.statics > best.statics) {
			best, bestParams = r, params
		}
	}
	return best, bestParams
}

// Handler is the net/http handler.
func Handler() http.Handler { return http.HandlerFunc(serve) }

// ListenAndServe starts the handler.
func ListenAndServe(addr string) error { return http.ListenAndServe(addr, Handler()) }

func writeJSON(w http.ResponseWriter, status int, body string, extra http.Header) {
	for k, vs := range extra {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, body)
}

func parseCookies(r *http.Request) map[string]string {
	out := map[string]string{}
	for _, c := range r.Cookies() {
		if _, dup := out[c.Name]; dup {
			continue
		}
		v := c.Value
		if dec, err := url.PathUnescape(v); err == nil {
			v = dec
		}
		out[c.Name] = v
	}
	return out
}

func report(err error, r *http.Request) {
	mu.RLock()
	f := cfg.OnError
	mu.RUnlock()
	if f != nil {
		f(err, r)
		return
	}
	log.Printf("[comatype] %v", err)
}

func serve(w http.ResponseWriter, r *http.Request) {
	method := strings.ToLower(r.Method)
	var segs []string
	for _, s := range pathSegs(r.URL.EscapedPath()) {
		dec, err := url.PathUnescape(s)
		if err != nil {
			writeJSON(w, 400, `{"code":"bad_request","message":"path が不正です"}`, nil)
			return
		}
		segs = append(segs, dec)
	}
	mu.RLock()
	rt, params := find(method, segs)
	var allow []string
	if rt == nil {
		seen := map[string]bool{}
		for _, o := range routes {
			if o2, _ := find(o.method, segs); o2 != nil && !seen[o.method] {
				seen[o.method] = true
				allow = append(allow, strings.ToUpper(o.method))
			}
		}
	}
	ws := wrappers
	mu.RUnlock()
	if rt == nil {
		if len(allow) > 0 {
			sort.Strings(allow)
			writeJSON(w, 405, fmt.Sprintf(`{"code":"method_not_allowed","message":%q}`, "使えるメソッド: "+strings.Join(allow, ", ")), http.Header{"Allow": {strings.Join(allow, ", ")}})
			return
		}
		writeJSON(w, 404, fmt.Sprintf(`{"code":"not_found","message":%q}`, r.URL.Path), nil)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, 400, `{"code":"bad_request","message":"ボディを読めません"}`, nil)
		return
	}

	// Cache (GET / QUERY, memory only; cookie caching is client-only). Looked up before the wrappers, so the key includes all headers (auth too)
	var cacheKey string
	if rt.cache.Memory() {
		cacheKey = comatype.ServerCacheKey(method, r.URL.RequestURI(), r.Header, body)
		if hit, ok := memCache.Get(cacheKey); ok {
			writeRaw(w, hit)
			return
		}
	}

	raw := comatype.NewRawRequest(method, r.URL.Path)
	raw.Header, raw.Query, raw.Params, raw.Body, raw.Cookies, raw.Context = r.Header, r.URL.Query(), params, body, parseCookies(r), r.Context()

	var resp comatype.RawResponse
	func() {
		defer func() {
			if rec := recover(); rec != nil {
				report(fmt.Errorf("%s: panic: %v", rt.module, rec), r)
				resp = comatype.ErrorResponse(nil)
			}
		}()
		chain := make([]comatype.ServerWrap, 0, len(rt.wraps))
		for _, name := range rt.wraps {
			wrap := ws[name]
			if wrap == nil {
				report(fmt.Errorf("ラッパー %s が Init に渡されていません（%s）", name, rt.module), r)
				resp = comatype.ErrorResponse(nil)
				return
			}
			chain = append(chain, wrap)
		}
		next := comatype.ServerNext(rt.handle)
		for i := len(chain) - 1; i >= 0; i-- {
			wrap, inner := chain[i], next
			next = func(req *comatype.RawRequest) comatype.RawResponse { return wrap(req, inner) }
		}
		resp = next(raw)
	}()
	if resp.Err != nil {
		report(fmt.Errorf("%s: %w", rt.module, resp.Err), r)
	}
	if cacheKey != "" && resp.Err == nil && comatype.Cacheable(resp) {
		memCache.Set(cacheKey, resp, time.Duration(rt.cache.TTLMillis)*time.Millisecond)
	}
	writeRaw(w, resp)
}

func writeRaw(w http.ResponseWriter, resp comatype.RawResponse) {
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	for _, c := range resp.SetCookies {
		w.Header().Add("Set-Cookie", c)
	}
	w.WriteHeader(resp.Status)
	if len(resp.Body) > 0 && resp.Status != 204 && resp.Status != 304 && resp.Status != 205 {
		_, _ = w.Write(resp.Body)
	}
}

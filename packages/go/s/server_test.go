package s_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/oldsheeep3/comatype/packages/go/comatype"
	"github.com/oldsheeep3/comatype/packages/go/s"
)

type req struct{ ID string }
type res struct {
	Status int
	Body   string
}

func ep(method, path string, wraps ...string) *comatype.Endpoint[comatype.NoArg, req, res] {
	return &comatype.Endpoint[comatype.NoArg, req, res]{
		Method: method, Path: path, Module: method + path, Wraps: wraps,
		ParseRequest: func(raw *comatype.RawRequest) (req, error) { return req{ID: raw.Params["id"]}, nil },
		BuildResponse: func(r res) (comatype.RawResponse, error) {
			out := comatype.NewRawResponse(r.Status)
			out.Body = []byte(r.Body)
			return out, nil
		},
	}
}

func do(t *testing.T, method, path string) (int, string, http.Header) {
	t.Helper()
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, httptest.NewRequest(method, path, nil))
	b, _ := io.ReadAll(w.Body)
	return w.Code, string(b), w.Header()
}

func TestRouting(t *testing.T) {
	s.Reset()
	s.Get(ep("get", "/user/:id"), func(r req) res { return res{200, "id:" + r.ID} })
	s.Get(ep("get", "/user/me"), func(r req) res { return res{200, "me"} })
	s.Post(ep("post", "/user/me"), func(r req) res { return res{201, ""} })

	if c, b, _ := do(t, "GET", "/user/me"); c != 200 || b != "me" {
		t.Fatal("静的が優先", c, b)
	}
	if c, b, _ := do(t, "GET", "/user/a%2Fb"); c != 200 || b != "id:a/b" {
		t.Fatal(c, b)
	}
	if c, b, _ := do(t, "GET", "/user/me/"); c != 200 || b != "me" {
		t.Fatal("末尾の / は無視", c, b)
	}
	if c, _, _ := do(t, "GET", "/none"); c != 404 {
		t.Fatal(c)
	}
	if c, _, h := do(t, "DELETE", "/user/me"); c != 405 || h.Get("Allow") != "GET, POST" {
		t.Fatal(c, h)
	}
}

func TestRegisterPanics(t *testing.T) {
	s.Reset()
	s.Get(ep("get", "/dup"), func(r req) res { return res{200, ""} })
	mustPanic(t, "重複", func() { s.Get(ep("get", "/dup"), func(r req) res { return res{} }) })
	mustPanic(t, "メソッド違い", func() { s.Post(ep("get", "/x"), func(r req) res { return res{} }) })
	mustPanic(t, "クライアント用", func() {
		s.Get(&comatype.Endpoint[comatype.NoArg, req, res]{Method: "get", Path: "/y"}, func(r req) res { return res{} })
	})
}

func mustPanic(t *testing.T, what string, f func()) {
	t.Helper()
	defer func() {
		if recover() == nil {
			t.Errorf("%s: panic するはず", what)
		}
	}()
	f()
}

func TestPanicBecomes500(t *testing.T) {
	s.Reset()
	var reported error
	s.Init(s.Config{OnError: func(err error, _ *http.Request) { reported = err }})
	s.Get(ep("get", "/boom"), func(r req) res { panic("secret") })
	c, b, _ := do(t, "GET", "/boom")
	if c != 500 || strings.Contains(b, "secret") || reported == nil {
		t.Fatal(c, b, reported)
	}
}

type wset map[string]comatype.ServerWrap

func (w wset) ComatypeWrappers() map[string]comatype.ServerWrap { return w }

type ctxA struct{ A int }
type ctxB struct{ B int }

func TestWrapperOrderAndCtx(t *testing.T) {
	s.Reset()
	var log []string
	a := s.ComatypeWrap[ctxA](func(r *s.RawRequest[ctxA], next s.Next[ctxA]) comatype.RawResponse {
		log = append(log, "a")
		r.Ctx = ctxA{A: 1}
		out := next(r)
		out.Header.Set("X-A", "1")
		return out
	})
	b := s.ComatypeWrap[ctxB](func(r *s.RawRequest[ctxB], next s.Next[ctxB]) comatype.RawResponse {
		log = append(log, "b")
		if r.Header.Get("X-Deny") != "" {
			return comatype.JSONResponse(401, &comatype.ErrorBody{Code: "denied"})
		}
		r.Ctx = ctxB{B: 2}
		return next(r)
	})
	s.Init(s.Config{Wrappers: wset{"a": s.Adapt("a", a), "b": s.Adapt("b", b)}})
	var got [2]int
	e := ep("get", "/w", "a", "b")
	e.ParseRequest = func(raw *comatype.RawRequest) (req, error) {
		got = [2]int{comatype.CtxValue[ctxA](raw, "a").A, comatype.CtxValue[ctxB](raw, "b").B}
		return req{}, nil
	}
	s.Get(e, func(r req) res { return res{200, "ok"} })

	code, _, h := do(t, "GET", "/w")
	if code != 200 || strings.Join(log, "") != "ab" || got != [2]int{1, 2} || h.Get("X-A") != "1" {
		t.Fatal(code, log, got, h)
	}
	// even if b short-circuits, the outer a sees the returning response
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/w", nil)
	r.Header.Set("X-Deny", "1")
	s.Handler().ServeHTTP(w, r)
	if w.Code != 401 || w.Header().Get("X-A") != "1" {
		t.Fatal(w.Code, w.Header())
	}
	// a wrapper that was not passed gives a 500
	s.Init(s.Config{Wrappers: wset{"a": s.Adapt("a", a)}, OnError: func(error, *http.Request) {}})
	if code, _, _ := do(t, "GET", "/w"); code != 500 {
		t.Fatal(code)
	}
}

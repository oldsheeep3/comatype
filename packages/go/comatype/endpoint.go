package comatype

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// NoArg is the Arg of an endpoint that takes no request argument.
type NoArg struct{}

// RawRequest is the raw request a wrapper sees (the on-the-wire form, with no per-endpoint types).
type RawRequest struct {
	Method string // lowercase (get, post, ...)
	// Path is the path with params filled in (client) or the path that arrived (server)
	Path    string
	Header  http.Header
	Query   url.Values
	Params  map[string]string
	Body    []byte
	Cookies map[string]string
	// Contexts holds the ctx added by server wrappers (wrapper name -> value)
	Contexts map[string]any
	Context  context.Context
}

func NewRawRequest(method, path string) *RawRequest {
	return &RawRequest{
		Method:   method,
		Path:     path,
		Header:   http.Header{},
		Query:    url.Values{},
		Params:   map[string]string{},
		Cookies:  map[string]string{},
		Contexts: map[string]any{},
		Context:  context.Background(),
	}
}

// Cookie returns the value of the received cookie (empty string if absent).
func (r *RawRequest) Cookie(name string) string { return r.Cookies[name] }

// RawResponse is the raw response a wrapper sees (the on-the-wire form).
type RawResponse struct {
	Status int
	Header http.Header
	Body   []byte
	// SetCookies holds the Set-Cookie lines to send (server). On the client, the lines received
	SetCookies []string
	// Err is the cause wrapped by ErrorResponse (not included in the response)
	Err error
}

func NewRawResponse(status int) RawResponse {
	return RawResponse{Status: status, Header: http.Header{}}
}

// JSONResponse builds a RawResponse with the body as JSON (used by wrappers via S401(...) etc.).
func JSONResponse(status int, body any) RawResponse {
	r := NewRawResponse(status)
	if body == nil {
		return r
	}
	b, err := Encode(body)
	if err != nil {
		return ErrorResponse(err)
	}
	r.Body = b
	r.Header.Set("Content-Type", "application/json")
	return r
}

// ErrorResponse turns the server's own error into a 500. Details are not shown to the client.
func ErrorResponse(err error) RawResponse {
	r := NewRawResponse(http.StatusInternalServerError)
	r.Body = []byte(`{"code":"internal_error","message":"Internal Server Error"}`)
	r.Header.Set("Content-Type", "application/json")
	r.Err = err
	return r
}

// Endpoint is the endpoint descriptor held by generated code.
// Arg is the argument the client passes, Req the request the server handler receives, Res the response.
type Endpoint[Arg, Req, Res any] struct {
	Method  string
	Path    string
	Module  string
	BaseURL string
	// Wraps are ordered from outermost to innermost
	Wraps     []string
	Cookie    bool
	CookieDef *CookieDef
	// Cache is the `cache` setting (GET / QUERY only; nil means no caching)
	Cache *CacheSpec
	// CacheHeaders are the names of declared request headers included in the client cache key
	CacheHeaders []string

	// Client
	BuildRequest  func(arg Arg) (*RawRequest, error)
	ParseResponse func(raw *RawResponse) (Res, error)
	// Server
	ParseRequest  func(raw *RawRequest) (Req, error)
	BuildResponse func(res Res) (RawResponse, error)
}

// UnexpectedStatusError means a status not declared in .comat was returned.
type UnexpectedStatusError struct {
	Status int
	Body   []byte
}

func (e *UnexpectedStatusError) Error() string {
	return fmt.Sprintf("想定していないステータス %d が返りました", e.Status)
}

// ErrorBody is the body of errors not in the .comat Response, such as 400.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path,omitempty"`
}

// ---- struct <-> RawRequest / RawResponse (used by generated code) ----

// SetParams validates params and fills in the `:name` segments of the path.
func SetParams(raw *RawRequest, params any) error {
	m, err := EncodeStrings(params)
	if err != nil {
		return err
	}
	segs := strings.Split(raw.Path, "/")
	for i, s := range segs {
		if strings.HasPrefix(s, ":") {
			v, ok := m[s[1:]]
			if !ok || len(v) == 0 {
				return fail(s[1:], "必須です")
			}
			raw.Params[s[1:]] = v[0]
			segs[i] = url.PathEscape(v[0])
		}
	}
	raw.Path = strings.Join(segs, "/")
	return nil
}

func SetQuery(raw *RawRequest, search any) error {
	m, err := EncodeStrings(search)
	if err != nil {
		return err
	}
	for k, vs := range m {
		for _, v := range vs {
			raw.Query.Add(k, v)
		}
	}
	return nil
}

func SetHeaders(raw *RawRequest, headers any) error { return EncodeHeader(raw.Header, headers) }

func SetBody(raw *RawRequest, body any) error {
	b, err := Encode(body)
	if err != nil {
		return err
	}
	raw.Body = b
	raw.Header.Set("Content-Type", "application/json")
	return nil
}

func GetParams(raw *RawRequest, dst any) error {
	m := map[string][]string{}
	for k, v := range raw.Params {
		m[k] = []string{v}
	}
	return DecodeStrings(m, dst)
}

func GetQuery(raw *RawRequest, dst any) error { return DecodeStrings(raw.Query, dst) }

func GetHeaders(raw *RawRequest, dst any) error { return DecodeHeader(raw.Header, dst) }

func GetBody(raw *RawRequest, dst any) error {
	if len(raw.Body) == 0 {
		return fail("body", "必須です")
	}
	err := Decode(raw.Body, dst)
	var ve *ValidationError
	if errors.As(err, &ve) {
		ve.Path = join("body", ve.Path)
	}
	return err
}

// CtxValue returns the ctx added by wrapper name (zero value if absent).
func CtxValue[T any](raw *RawRequest, name string) T {
	v, _ := raw.Contexts[name].(T)
	return v
}

// DecodeResponseBody reads the response body into dst. Returns false if the body is empty.
func DecodeResponseBody(raw *RawResponse, dst any) (bool, error) {
	if len(raw.Body) == 0 {
		return false, nil
	}
	return true, Decode(raw.Body, dst)
}

func SetResponseBody(out *RawResponse, body any) error {
	b, err := Encode(body)
	if err != nil {
		return err
	}
	out.Body = b
	out.Header.Set("Content-Type", "application/json")
	return nil
}

// ServerNext / ServerWrap are the untyped forms of server wrappers (made by s.Adapt).
type (
	ServerNext func(req *RawRequest) RawResponse
	ServerWrap func(req *RawRequest, next ServerNext) RawResponse
)

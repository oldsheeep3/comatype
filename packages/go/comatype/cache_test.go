package comatype

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestMemoryCacheTTLAndLimit(t *testing.T) {
	c := NewMemoryCache(2)
	now := time.Unix(1000, 0)
	c.now = func() time.Time { return now }
	c.Set("a", RawResponse{Status: 200, Body: []byte("1")}, 100*time.Millisecond)
	if r, ok := c.Get("a"); !ok || string(r.Body) != "1" {
		t.Fatal("hit のはず")
	}
	now = now.Add(101 * time.Millisecond)
	if _, ok := c.Get("a"); ok {
		t.Fatal("期限切れのはず")
	}
	c.Set("a", RawResponse{Status: 200}, time.Hour)
	c.Set("b", RawResponse{Status: 200}, time.Hour)
	c.Set("c", RawResponse{Status: 200}, time.Hour)
	if _, ok := c.Get("a"); ok {
		t.Fatal("上限を超えた古いものは捨てる")
	}
}

func TestCacheCookieRoundTrip(t *testing.T) {
	r := RawResponse{Status: 200, Header: http.Header{"X-A": {"あ"}}, Body: []byte(`{"n":1}`)}
	v, ok := EncodeCacheCookie(r)
	if !ok || strings.ContainsAny(v, "=;, ") {
		t.Fatalf("cookie に使える値のはず: %q", v)
	}
	got, ok := DecodeCacheCookie(v)
	if !ok || got.Status != 200 || got.Header.Get("X-A") != "あ" || string(got.Body) != `{"n":1}` {
		t.Fatalf("往復: %+v", got)
	}
	if _, ok := EncodeCacheCookie(RawResponse{Status: 200, Body: []byte(strings.Repeat("x", 5000))}); ok {
		t.Fatal("大きすぎるものは作らない")
	}
	if _, ok := DecodeCacheCookie("!!!"); ok {
		t.Fatal("壊れた値")
	}
	if len(CacheCookieName("k")) != len(CacheCookiePrefix)+16 {
		t.Fatal("名前の長さ")
	}
}

func TestCacheKeys(t *testing.T) {
	h1 := http.Header{"X-V": {"1"}, "Authorization": {"a"}}
	h2 := http.Header{"X-V": {"1"}, "Authorization": {"b"}}
	if ClientCacheKey("get", "u", nil, []string{"x-v"}, h1) != ClientCacheKey("get", "u", nil, []string{"x-v"}, h2) {
		t.Fatal("クライアントは宣言したヘッダだけ")
	}
	if ServerCacheKey("get", "/n", h1, nil) == ServerCacheKey("get", "/n", h2, nil) {
		t.Fatal("サーバは全ヘッダ")
	}
}

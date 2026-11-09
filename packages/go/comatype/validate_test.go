package comatype_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/oldsheeep3/comatype/packages/go/comatype"
)

type Address struct {
	Zip  string  `json:"zip" pattern:"^[0-9]{3}-[0-9]{4}$"`
	Line *string `json:"line,omitempty"`
}

type User struct {
	Name      string           `json:"name" min:"1" max:"5"`
	Age       *int             `json:"age,omitempty" min:"0" max:"150"`
	Email     comatype.Email   `json:"email"`
	UID       comatype.Uuidv4  `json:"uid"`
	Followers comatype.Int64   `json:"followers"`
	Balance   comatype.Decimal `json:"balance" min:"0"`
	Status    string           `json:"status" oneof:"active|banned"`
	Tags      []string         `json:"tags"`
	Home      Address          `json:"home"`
	Created   time.Time        `json:"created"`
	Deleted   *time.Time       `json:"deleted"`
	Raw       json.RawMessage  `json:"raw,omitempty"`
	Blob      []byte           `json:"blob,omitempty"`
}

const okUser = `{"name":"taro","email":"a@b.co","uid":"3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10","followers":"9007199254740993","balance":"12.5",
"status":"active","tags":["a"],"home":{"zip":"123-4567"},"created":"2024-01-02T03:04:05Z","deleted":null,"blob":"aGk="}`

func TestDecodeOK(t *testing.T) {
	var u User
	if err := comatype.Decode([]byte(okUser), &u); err != nil {
		t.Fatal(err)
	}
	if u.Followers != 9007199254740993 || u.Deleted != nil || string(u.Blob) != "hi" || u.Age != nil {
		t.Fatalf("%+v", u)
	}
	out, err := comatype.Encode(&u)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `"followers":"9007199254740993"`) {
		t.Fatalf("int64 は文字列で出る: %s", out)
	}
}

func TestDecodeErrors(t *testing.T) {
	mut := func(from, to string) string { return strings.Replace(okUser, from, to, 1) }
	cases := []struct{ name, json, path string }{
		{"必須が無い", mut(`"name":"taro",`, ""), "name"},
		{"文字数", mut(`"taro"`, `"toolong"`), "name"},
		{"null は不可", mut(`"taro"`, `null`), "name"},
		{"型違い", mut(`"taro"`, `1`), "name"},
		{"email", mut(`a@b.co`, `nope`), "email"},
		{"uuidv4", mut(`4b6e`, `7b6e`), "uid"},
		{"int64 は文字列", mut(`"9007199254740993"`, `1`), ""},
		{"decimal", mut(`"12.5"`, `"x"`), "balance"},
		{"decimal の範囲", mut(`"12.5"`, `"-1"`), "balance"},
		{"oneof", mut(`"active"`, `"gone"`), "status"},
		{"pattern(ネスト)", mut(`123-4567`, `1234567`), "home.zip"},
		{"配列の型", mut(`["a"]`, `[1]`), "tags[0]"},
		{"整数の範囲", mut(`"tags"`, `"age":200,"tags"`), "age"},
		{"整数でない", mut(`"tags"`, `"age":1.5,"tags"`), "age"},
		{"datetime", mut(`2024-01-02T03:04:05Z`, `2024-01-02`), ""},
	}
	for _, c := range cases {
		var u User
		err := comatype.Decode([]byte(c.json), &u)
		if err == nil {
			t.Errorf("%s: エラーになるはず", c.name)
			continue
		}
		var ve *comatype.ValidationError
		if c.path != "" && (!errors.As(err, &ve) || ve.Path != c.path) {
			t.Errorf("%s: path = %v, want %s", c.name, err, c.path)
		}
	}
}

type Params struct {
	ID comatype.Uuidv4 `wire:"id"`
}

type Search struct {
	Verbose *bool      `wire:"verbose"`
	Limit   *int       `wire:"limit"`
	Tag     []string   `wire:"tag"`
	At      *time.Time `wire:"at"`
}

type Headers struct {
	Allow []string       `wire:"Allow"`
	Count *int           `wire:"X-Count"`
	ReqID *comatype.Uuid `wire:"X-Request-Id"`
}

func TestStrings(t *testing.T) {
	var s Search
	err := comatype.DecodeStrings(map[string][]string{"verbose": {"true"}, "limit": {"5"}, "tag": {"a", "b"}, "at": {"2024-01-02T03:04:05Z"}}, &s)
	if err != nil || *s.Verbose != true || *s.Limit != 5 || len(s.Tag) != 2 || s.At.Year() != 2024 {
		t.Fatalf("%v %+v", err, s)
	}
	if err := comatype.DecodeStrings(map[string][]string{"limit": {"x"}}, &s); err == nil {
		t.Fatal("整数でないのでエラー")
	}
	if err := comatype.DecodeStrings(map[string][]string{}, &Params{}); err == nil {
		t.Fatal("必須")
	}
	m, err := comatype.EncodeStrings(&Search{Verbose: comatype.Ptr(false), Tag: []string{"x", "y"}})
	if err != nil || m["verbose"][0] != "false" || len(m["tag"]) != 2 || m["limit"] != nil {
		t.Fatalf("%v %v", err, m)
	}
	if _, err := comatype.EncodeStrings(&Params{ID: "bad"}); err == nil {
		t.Fatal("uuidv4 の検証")
	}
}

func TestHeader(t *testing.T) {
	h := http.Header{}
	h.Set("allow", "GET, POST , PUT")
	h.Set("x-count", "3")
	var got Headers
	if err := comatype.DecodeHeader(h, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Allow) != 3 || got.Allow[2] != "PUT" || *got.Count != 3 || got.ReqID != nil {
		t.Fatalf("%+v", got)
	}
	out := http.Header{}
	if err := comatype.EncodeHeader(out, &Headers{Allow: []string{"GET", "PUT"}}); err != nil {
		t.Fatal(err)
	}
	if out.Get("Allow") != "GET, PUT" {
		t.Fatal(out)
	}
	if err := comatype.DecodeHeader(http.Header{}, &got); err == nil {
		t.Fatal("Allow は必須")
	}
}

func TestScalars(t *testing.T) {
	ok := []comatype.Validator{comatype.Phone("+819012345678"), comatype.Uuid("3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10"), comatype.Uuidv7("01890a5d-ac96-774b-bcce-b302099a8057"),
		comatype.Date("2024-02-29"), comatype.Time("23:59:59"), comatype.Url("https://example.com/a"), comatype.Decimal("-1.50")}
	for _, v := range ok {
		if err := v.Validate(); err != nil {
			t.Errorf("%v: %v", v, err)
		}
	}
	bad := []comatype.Validator{comatype.Phone("0901234"), comatype.Uuid("x"), comatype.Uuidv7("3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10"), comatype.Date("2023-02-29"),
		comatype.Time("24:00:00"), comatype.Url("example.com"), comatype.Decimal("1e5")}
	for _, v := range bad {
		if err := v.Validate(); err == nil {
			t.Errorf("%v: エラーになるはず", v)
		}
	}
}

func TestSetCookie(t *testing.T) {
	def := &comatype.CookieDef{Name: "session", HTTPOnly: true, Secure: true, SameSite: "lax"}
	got, err := comatype.SerializeSetCookie(def, &comatype.CookieValue{Value: "a b"})
	if err != nil || got != "session=a%20b; Path=/; HttpOnly; Secure; SameSite=Lax" {
		t.Fatalf("%v %q", err, got)
	}
	opt := &comatype.CookieValue{Value: "x"}
	comatype.MaxAge(10)(opt)
	got, _ = comatype.SerializeSetCookie(def, opt)
	if !strings.Contains(got, "Max-Age=10;") {
		t.Fatal(got)
	}
	got, _ = comatype.SerializeSetCookie(def, &comatype.CookieValue{Delete: true})
	if got != "session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax" {
		t.Fatal(got)
	}
	if _, err := comatype.SerializeSetCookie(def, &comatype.CookieValue{Value: "x", Path: "/a; Domain=evil"}); err == nil {
		t.Fatal("path に ; は使えない")
	}
	if _, err := comatype.SerializeSetCookie(nil, &comatype.CookieValue{Value: "x"}); err == nil {
		t.Fatal("宣言が無ければエラー")
	}
}

func TestCookieJar(t *testing.T) {
	j := comatype.NewCookieJar()
	j.Store([]string{"session=tok%20en; Path=/; HttpOnly", "scoped=1; Path=/admin", "dated=1; Expires=Thu, 01 Jan 2099 00:00:00 GMT", "broken"})
	if g := j.Get("/user"); g["session"] != "tok en" || g["scoped"] != "" || g["dated"] != "1" {
		t.Fatal(g)
	}
	if g := j.Get("/admin/x"); g["scoped"] != "1" {
		t.Fatal(g)
	}
	if g := j.Get("/administrator"); g["scoped"] != "" {
		t.Fatal("境界は / で区切る", g)
	}
	j.Store([]string{"session=; Max-Age=0; Path=/"})
	if g := j.Get("/"); g["session"] != "" {
		t.Fatal(g)
	}
}

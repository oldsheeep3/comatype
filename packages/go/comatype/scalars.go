// Package comatype holds the parts shared by c (client), s (server) and generated code.
package comatype

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"time"
)

// Custom types wrapping a string. On the wire they are JSON strings; Validate() checks the format.
type (
	Email   string
	Phone   string
	Uuid    string
	Uuidv4  string
	Uuidv7  string
	Date    string
	Time    string
	Decimal string
	Url     string
)

// Int64 is a 64-bit integer sent as a string on the wire (JavaScript loses precision above 2^53).
type Int64 int64

var (
	emailRe   = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	phoneRe   = regexp.MustCompile(`^\+[1-9]\d{1,14}$`)
	uuidRe    = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	uuidVerRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-([0-9a-fA-F])[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)
	timeRe    = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$`)
	decimalRe = regexp.MustCompile(`^-?\d+(\.\d+)?$`)
)

func (v Email) Validate() error {
	if !emailRe.MatchString(string(v)) {
		return fmt.Errorf("email の形式が不正です")
	}
	return nil
}

func (v Phone) Validate() error {
	if !phoneRe.MatchString(string(v)) {
		return fmt.Errorf("phone は E.164 の形式にしてください")
	}
	return nil
}

func (v Uuid) Validate() error {
	if !uuidRe.MatchString(string(v)) {
		return fmt.Errorf("uuid の形式が不正です")
	}
	return nil
}

func uuidVersion(s string, want byte) error {
	m := uuidVerRe.FindStringSubmatch(s)
	if m == nil || m[1][0] != want {
		return fmt.Errorf("uuidv%c の形式が不正です", want)
	}
	return nil
}

func (v Uuidv4) Validate() error { return uuidVersion(string(v), '4') }
func (v Uuidv7) Validate() error { return uuidVersion(string(v), '7') }

func (v Date) Validate() error {
	t, err := time.Parse("2006-01-02", string(v))
	if err != nil || t.Format("2006-01-02") != string(v) {
		return fmt.Errorf("date は YYYY-MM-DD の形式にしてください")
	}
	return nil
}

func (v Time) Validate() error {
	if !timeRe.MatchString(string(v)) {
		return fmt.Errorf("time は HH:MM:SS の形式にしてください")
	}
	return nil
}

func (v Decimal) Validate() error {
	if !decimalRe.MatchString(string(v)) {
		return fmt.Errorf("decimal は数値の文字列にしてください")
	}
	return nil
}

func (v Url) Validate() error {
	u, err := url.Parse(string(v))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("url は http(s)://host/... の形式にしてください")
	}
	return nil
}

func (v Int64) MarshalJSON() ([]byte, error) {
	return json.Marshal(strconv.FormatInt(int64(v), 10))
}

func (v *Int64) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("int64 は整数の文字列で送ってください")
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return fmt.Errorf("int64 は整数の文字列で送ってください")
	}
	*v = Int64(n)
	return nil
}

// Ptr is a helper for passing a value to an optional (pointer) field.
func Ptr[T any](v T) *T { return &v }

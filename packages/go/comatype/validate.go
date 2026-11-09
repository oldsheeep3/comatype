package comatype

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Types implementing Validator are checked with Validate() during Decode / Encode.
type Validator interface{ Validate() error }

// ValidationError means an input or output does not match the .comat type.
type ValidationError struct {
	Path   string
	Reason string
}

func (e *ValidationError) Error() string {
	if e.Path == "" {
		return e.Reason
	}
	return e.Path + ": " + e.Reason
}

func fail(path, reason string, args ...any) error {
	return &ValidationError{Path: path, Reason: fmt.Sprintf(reason, args...)}
}

func join(path, name string) string {
	if path == "" {
		return name
	}
	return path + "." + name
}

var (
	rawMessageType = reflect.TypeOf(json.RawMessage(nil))
	timeType       = reflect.TypeOf(time.Time{})
	int64Type      = reflect.TypeOf(Int64(0))
	decimalType    = reflect.TypeOf(Decimal(""))
	validatorType  = reflect.TypeOf((*Validator)(nil)).Elem()
)

// Decode reads JSON into v (a pointer) and validates required fields, types and constraints.
//
// Struct fields that are pointers or have `json:",omitempty"` are optional; all others are required.
func Decode(data []byte, v any) error {
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Pointer || rv.IsNil() {
		return errors.New("comatype: Decode には nil でないポインタを渡してください")
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var raw any
	if err := dec.Decode(&raw); err != nil {
		return fail("", "JSON として読めません: %v", err)
	}
	if err := checkShape(rv.Type().Elem(), raw, ""); err != nil {
		return err
	}
	if err := json.Unmarshal(data, v); err != nil {
		return fail("", "%v", err)
	}
	return validateValue(rv.Elem(), "", reflect.StructTag(""))
}

// Encode validates v and then encodes it as JSON.
func Encode(v any) ([]byte, error) {
	if err := validateValue(reflect.ValueOf(v), "", reflect.StructTag("")); err != nil {
		return nil, err
	}
	return json.Marshal(v)
}

func jsonName(f reflect.StructField) (name string, omitempty bool, skip bool) {
	tag := f.Tag.Get("json")
	if tag == "-" {
		return "", false, true
	}
	parts := strings.Split(tag, ",")
	name = parts[0]
	if name == "" {
		name = f.Name
	}
	for _, p := range parts[1:] {
		if p == "omitempty" {
			omitempty = true
		}
	}
	return name, omitempty, false
}

func checkShape(t reflect.Type, raw any, path string) error {
	if t == rawMessageType || t.Kind() == reflect.Interface {
		return nil
	}
	if t.Kind() == reflect.Pointer {
		if raw == nil {
			return nil
		}
		return checkShape(t.Elem(), raw, path)
	}
	if raw == nil {
		return fail(path, "null は使えません")
	}
	switch {
	case t == timeType, t == int64Type:
		if _, ok := raw.(string); !ok {
			return fail(path, "文字列ではありません")
		}
		return nil
	}
	switch t.Kind() {
	case reflect.Struct:
		obj, ok := raw.(map[string]any)
		if !ok {
			return fail(path, "オブジェクトではありません")
		}
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			if !f.IsExported() {
				continue
			}
			name, omitempty, skip := jsonName(f)
			if skip {
				continue
			}
			val, present := obj[name]
			if !present {
				if omitempty || f.Type.Kind() == reflect.Pointer {
					continue
				}
				return fail(join(path, name), "必須です")
			}
			if err := checkShape(f.Type, val, join(path, name)); err != nil {
				return err
			}
		}
	case reflect.Slice:
		if t.Elem().Kind() == reflect.Uint8 {
			if _, ok := raw.(string); !ok {
				return fail(path, "base64 の文字列ではありません")
			}
			return nil
		}
		arr, ok := raw.([]any)
		if !ok {
			return fail(path, "配列ではありません")
		}
		for i, e := range arr {
			if err := checkShape(t.Elem(), e, fmt.Sprintf("%s[%d]", path, i)); err != nil {
				return err
			}
		}
	case reflect.String:
		if _, ok := raw.(string); !ok {
			return fail(path, "文字列ではありません")
		}
	case reflect.Bool:
		if _, ok := raw.(bool); !ok {
			return fail(path, "真偽値ではありません")
		}
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64, reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		n, ok := raw.(json.Number)
		if !ok {
			return fail(path, "整数ではありません")
		}
		if _, err := strconv.ParseInt(n.String(), 10, 64); err != nil {
			return fail(path, "整数ではありません")
		}
	case reflect.Float32, reflect.Float64:
		if _, ok := raw.(json.Number); !ok {
			return fail(path, "数値ではありません")
		}
	}
	return nil
}

// validateValue checks Validate() and the field tag constraints (min / max / pattern / oneof).
func validateValue(v reflect.Value, path string, tag reflect.StructTag) error {
	if !v.IsValid() {
		return nil
	}
	switch v.Kind() {
	case reflect.Pointer:
		if v.IsNil() {
			return nil
		}
		return validateValue(v.Elem(), path, tag)
	case reflect.Interface:
		return nil
	}
	if v.Type().Implements(validatorType) && v.CanInterface() {
		if err := v.Interface().(Validator).Validate(); err != nil {
			return fail(path, "%s", err.Error())
		}
	}
	if err := checkConstraints(v, path, tag); err != nil {
		return err
	}
	switch v.Kind() {
	case reflect.Struct:
		if v.Type() == timeType {
			return nil
		}
		for i := 0; i < v.NumField(); i++ {
			f := v.Type().Field(i)
			if !f.IsExported() {
				continue
			}
			name := f.Name
			if wire := f.Tag.Get("wire"); wire != "" {
				name = wire
			} else if n, _, skip := jsonName(f); !skip {
				name = n
			} else {
				continue
			}
			if err := validateValue(v.Field(i), join(path, name), f.Tag); err != nil {
				return err
			}
		}
	case reflect.Slice:
		if v.Type().Elem().Kind() == reflect.Uint8 {
			return nil
		}
		for i := 0; i < v.Len(); i++ {
			if err := validateValue(v.Index(i), fmt.Sprintf("%s[%d]", path, i), tag); err != nil {
				return err
			}
		}
	}
	return nil
}

func checkConstraints(v reflect.Value, path string, tag reflect.StructTag) error {
	minS, hasMin := tag.Lookup("min")
	maxS, hasMax := tag.Lookup("max")
	pattern, hasPattern := tag.Lookup("pattern")
	oneof, hasOneof := tag.Lookup("oneof")
	if !hasMin && !hasMax && !hasPattern && !hasOneof {
		return nil
	}
	var n float64
	var isNum bool
	var s string
	switch {
	case v.Type() == decimalType:
		f, err := strconv.ParseFloat(v.String(), 64)
		if err != nil {
			return nil // reported by Validate()
		}
		n, isNum = f, true
	case v.Kind() == reflect.String:
		s = v.String()
		n = float64(utf8.RuneCountInString(s))
		isNum = true
	case v.CanInt():
		n, isNum = float64(v.Int()), true
	default:
		return nil
	}
	what := "値"
	if v.Kind() == reflect.String && v.Type() != decimalType {
		what = "文字数"
	}
	if hasMin && isNum {
		m, _ := strconv.ParseFloat(minS, 64)
		if n < m {
			return fail(path, "%s は %s 以上にしてください", what, minS)
		}
	}
	if hasMax && isNum {
		m, _ := strconv.ParseFloat(maxS, 64)
		if n > m {
			return fail(path, "%s は %s 以下にしてください", what, maxS)
		}
	}
	if hasPattern && v.Kind() == reflect.String {
		re, err := regexp.Compile(pattern)
		if err != nil {
			return fail(path, "pattern %q が不正です", pattern)
		}
		if !re.MatchString(s) {
			return fail(path, "パターン %s に一致しません", pattern)
		}
	}
	if hasOneof && v.Kind() == reflect.String {
		ok := false
		for _, o := range strings.Split(oneof, "|") {
			if o == s {
				ok = true
			}
		}
		if !ok {
			return fail(path, "%s のどれかにしてください", strings.ReplaceAll(oneof, "|", " | "))
		}
	}
	return nil
}

// ---- values that arrive as strings (path, query, headers) ----

// wire tag name -> value. Header names are case-insensitive
func lookupFn(m map[string][]string, ci bool) func(string) []string {
	if !ci {
		return func(name string) []string { return m[name] }
	}
	return func(name string) []string {
		return http.Header(m).Values(name)
	}
}

// DecodeStrings reads a map (path params, query) into the struct dst with `wire:"name"` tags and validates it.
func DecodeStrings(src map[string][]string, dst any) error {
	return decodeStrings(lookupFn(src, false), dst, false)
}

// DecodeHeader reads headers into a struct. An array arrives as one ", "-separated value.
func DecodeHeader(h http.Header, dst any) error {
	return decodeStrings(lookupFn(h, true), dst, true)
}

func decodeStrings(lookup func(string) []string, dst any, split bool) error {
	rv := reflect.ValueOf(dst)
	if rv.Kind() != reflect.Pointer || rv.Elem().Kind() != reflect.Struct {
		return errors.New("comatype: 構造体へのポインタを渡してください")
	}
	sv := rv.Elem()
	for i := 0; i < sv.NumField(); i++ {
		f := sv.Type().Field(i)
		name := f.Tag.Get("wire")
		if name == "" || !f.IsExported() {
			continue
		}
		vals := lookup(name)
		if len(vals) == 0 {
			if f.Type.Kind() == reflect.Pointer {
				continue
			}
			return fail(name, "必須です")
		}
		if err := setFromStrings(sv.Field(i), vals, split); err != nil {
			return fail(name, "%s", err.Error())
		}
	}
	return validateValue(sv, "", reflect.StructTag(""))
}

func setFromStrings(fv reflect.Value, vals []string, split bool) error {
	t := fv.Type()
	if t.Kind() == reflect.Pointer {
		p := reflect.New(t.Elem())
		if err := setFromStrings(p.Elem(), vals, split); err != nil {
			return err
		}
		fv.Set(p)
		return nil
	}
	if t.Kind() == reflect.Slice && t.Elem().Kind() != reflect.Uint8 {
		items := vals
		if split && len(vals) == 1 {
			items = nil
			if strings.TrimSpace(vals[0]) != "" {
				for _, p := range strings.Split(vals[0], ",") {
					items = append(items, strings.TrimSpace(p))
				}
			}
		}
		s := reflect.MakeSlice(t, len(items), len(items))
		for i, it := range items {
			if err := setScalar(s.Index(i), it); err != nil {
				return err
			}
		}
		fv.Set(s)
		return nil
	}
	return setScalar(fv, vals[0])
}

func setScalar(fv reflect.Value, s string) error {
	t := fv.Type()
	if t == timeType {
		tm, err := time.Parse(time.RFC3339Nano, s)
		if err != nil {
			return errors.New("datetime は RFC 3339 の形式にしてください")
		}
		fv.Set(reflect.ValueOf(tm))
		return nil
	}
	switch t.Kind() {
	case reflect.String:
		fv.SetString(s)
	case reflect.Bool:
		switch s {
		case "true":
			fv.SetBool(true)
		case "false":
			fv.SetBool(false)
		default:
			return errors.New("真偽値は true か false にしてください")
		}
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		n, err := strconv.ParseInt(strings.TrimSpace(s), 10, t.Bits())
		if err != nil {
			return errors.New("整数ではありません")
		}
		fv.SetInt(n)
	case reflect.Float32, reflect.Float64:
		n, err := strconv.ParseFloat(strings.TrimSpace(s), t.Bits())
		if err != nil {
			return errors.New("数値ではありません")
		}
		fv.SetFloat(n)
	default:
		return fmt.Errorf("%s は path・クエリ・ヘッダに使えない型です", t)
	}
	return nil
}

// EncodeStrings validates the struct src (with `wire` tags) and turns it into name -> values. nil pointers are omitted.
func EncodeStrings(src any) (map[string][]string, error) {
	rv := reflect.ValueOf(src)
	for rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return map[string][]string{}, nil
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return nil, errors.New("comatype: 構造体を渡してください")
	}
	if err := validateValue(rv, "", reflect.StructTag("")); err != nil {
		return nil, err
	}
	out := map[string][]string{}
	for i := 0; i < rv.NumField(); i++ {
		f := rv.Type().Field(i)
		name := f.Tag.Get("wire")
		if name == "" || !f.IsExported() {
			continue
		}
		fv := rv.Field(i)
		for fv.Kind() == reflect.Pointer {
			if fv.IsNil() {
				break
			}
			fv = fv.Elem()
		}
		if fv.Kind() == reflect.Pointer {
			continue
		}
		if fv.Kind() == reflect.Slice && fv.Type().Elem().Kind() != reflect.Uint8 {
			for j := 0; j < fv.Len(); j++ {
				out[name] = append(out[name], scalarString(fv.Index(j)))
			}
			continue
		}
		out[name] = []string{scalarString(fv)}
	}
	return out, nil
}

func scalarString(v reflect.Value) string {
	if v.Type() == timeType {
		return v.Interface().(time.Time).Format(time.RFC3339Nano)
	}
	switch v.Kind() {
	case reflect.String:
		return v.String()
	case reflect.Bool:
		return strconv.FormatBool(v.Bool())
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return strconv.FormatInt(v.Int(), 10)
	case reflect.Float32, reflect.Float64:
		return strconv.FormatFloat(v.Float(), 'f', -1, 64)
	}
	return fmt.Sprint(v.Interface())
}

// EncodeHeader writes a struct as headers. Arrays are joined with ", ".
func EncodeHeader(h http.Header, src any) error {
	m, err := EncodeStrings(src)
	if err != nil {
		return err
	}
	for k, v := range m {
		h.Set(k, strings.Join(v, ", "))
	}
	return nil
}

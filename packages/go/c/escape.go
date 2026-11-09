package c

import "net/url"

func escape(s string) string { return url.QueryEscape(s) }

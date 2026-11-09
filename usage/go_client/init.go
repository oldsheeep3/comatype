package main

// Client init file: import and pass the implemented ComatypeWrap
// The base url defaults to baseUrl in init.comat. Override with the COMATYPE_BASE_URL environment variable or BaseURL
// Call InitComatype() once at startup (whether a wrapper is on or off is decided by defaults.comat and `wrap` in each .comat)
import (
	"github.com/oldsheeep3/comatype/packages/go/c"
	"example.com/app/wrappers"
	// Package generated from init.comat
	comatype_init "example.com/app/comatype/init"
)

func InitComatype() {
	c.Init(c.Config{
		// With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a compile error
		Wrappers: comatype_init.Wrappers{Auth: wrappers.Auth},

		// Used by `cookie on` endpoints. The cookie jar keeps the httpOnly cookie
		CookieJar: c.NewCookieJar(),
	})
}

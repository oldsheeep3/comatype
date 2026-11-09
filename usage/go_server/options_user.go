package main

import (
	"github.com/oldsheeep3/comatype/packages/go/s"
	"example.com/app/comatype/options_user"
)

// There are no params / search / body, so the handler has no request to read
func registerOptionsUser() {
	s.Options(options_user.Endpoint, func(req options_user.Request) options_user.Response {
		// The first argument is the body (nil because it is none), the second is the response headers
		return options_user.S200(nil, &options_user.S200Headers{
			Allow: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "QUERY"},
		})
	})
}

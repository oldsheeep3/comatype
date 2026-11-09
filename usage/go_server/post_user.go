package main

import (
	// s is the server side, c is the client side (see ../go_client/post_user.go)
	// Call the methods as s.Post() / s.Get() / s.Put() / s.Delete() / s.Options() / s.Query()
	"github.com/oldsheeep3/comatype/packages/go/s"

	// Package generated from post_user.comat by `comatype generate --lang go`
	"example.com/app/comatype/post_user"
)

func registerPostUser() {
	s.Post(post_user.Endpoint, func(req post_user.Request) post_user.Response {
		// req.Body is the data sent by the client: post_user.Body (UserData)
		user := req.Body

		// post_user.S200() builds a response with status 200
		// S200Res is the response body (UserData without uid). The struct has no uid field
		return post_user.S200(&post_user.S200Res{Name: user.Name, Email: user.Email, Phone: user.Phone})

		// To return only the status code, post_user.S200(nil) does the same
		// The response body is nullable, so no body (nil) is allowed
	})
}

package main

import (
	"context"

	// c is the client side, s is the server side (see ../go_server/post_user.go)
	// Call the methods as c.Post() / c.Get() / c.Put() / c.Delete() / c.Options() / c.Query()
	"github.com/oldsheeep3/comatype/packages/go/c"

	// Package generated from post_user.comat by `comatype generate --lang go`
	//   Endpoint : path and method
	//   Body     : the request body (the `body` line)
	//   Request  : the whole request (Params, Search, Body)
	//   Response : the response. Go has no union types, so it has a field per status (S200, S401, ...)
	//   S200()   : a function that builds a response with status 200
	//   S200Res  : the type of the response body for status 200
	"example.com/app/comatype/post_user"
)

func PostUser(ctx context.Context, userInput post_user.Body) error {
	// Body is validated with Validate() before sending, and the response body after receiving
	res, err := c.Post(ctx, post_user.Endpoint, userInput)
	if err != nil {
		return err // Communication errors, decode errors, etc.
	}

	switch res.Status {
	case 200:
		// *post_user.S200Res (UserData without uid). nil if the server sends no body (nullable)
		_ = res.S200
	}
	// 2** goes to the S2xx field, everything else to the S4xx field (error body)
	return nil
}

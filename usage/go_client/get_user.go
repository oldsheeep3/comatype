package main

import (
	"context"

	"github.com/oldsheeep3/comatype/packages/go/c"
	"github.com/oldsheeep3/comatype/packages/go/comatype"
	"example.com/app/comatype/get_user"
)

func GetUser(ctx context.Context, id string) error {
	// Req has Params and Search, typed from the params / search blocks of get_user.comat
	// Request is the same type on the client and the server
	res, err := c.Get(ctx, get_user.Endpoint, get_user.Request{
		Params: get_user.Params{ID: comatype.Uuidv4(id)}, // uuidv4 is a custom type wrapping a string (comatype.Uuidv4). Validate() checks the format
		Search: get_user.Search{Verbose: c.Ptr(true)}, // optional, so a pointer
	})
	if err != nil {
		return err
	}

	switch res.Status {
	case 200:
		_ = res.S200 // *get_user.S200Res (UserData)
	case 404:
		_ = res.S404 // *get_user.S404Res (ApiError)
	}
	return nil
}

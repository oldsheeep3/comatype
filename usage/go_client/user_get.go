package main

import (
	"context"

	"github.com/oldsheeep3/comatype/packages/go/c"
	// user/get.comat -> GET /user. The generated package name is user_get, the path joined
	user_get "example.com/app/comatype/user/get"
)

func UserGet(ctx context.Context, limit int) error {
	// Search is the search block of get.comat (limit?: int). It is optional, so a pointer
	res, err := c.Get(ctx, user_get.Endpoint, user_get.Request{
		Search: user_get.Search{Limit: &limit},
	})
	if err != nil {
		return err
	}

	if res.Status == 200 {
		_ = res.S200 // *user_get.S200Res ([]UserData)
	}
	return nil
}

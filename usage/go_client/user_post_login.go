package main

import (
	"context"

	"github.com/oldsheeep3/comatype/packages/go/c"
	// user/post_login.comat -> POST /user/login. The package name is user_post_login
	user_post_login "example.com/app/comatype/user/post_login"
)

func UserPostLogin(ctx context.Context, input user_post_login.Body) error {
	res, err := c.Post(ctx, user_post_login.Endpoint, input)
	if err != nil {
		return err
	}

	switch res.Status {
	case 200:
		_ = res.S200.UID // uuidv4
	case 401:
		_ = res.S401 // *user_post_login.S401Res (ApiError)
	}
	return nil
}

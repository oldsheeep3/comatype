package main

import (
	"context"

	"github.com/oldsheeep3/comatype/packages/go/c"
	// user/profile/get.comat -> GET /user/profile. The package name is user_profile_get
	user_profile_get "example.com/app/comatype/user/profile/get"
)

func UserProfileGet(ctx context.Context) error {
	// There are no params / search / body, so no request argument is needed
	res, err := c.Get(ctx, user_profile_get.Endpoint)
	if err != nil {
		return err
	}

	if res.Status == 200 {
		_ = res.S200 // *user_profile_get.S200Res (UserData)
	}
	return nil
}

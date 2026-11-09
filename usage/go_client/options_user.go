package main

import (
	"context"

	"github.com/oldsheeep3/comatype/packages/go/c"
	"example.com/app/comatype/options_user"
)

func OptionsUser(ctx context.Context) error {
	// There are no params / search / body, so no request argument is needed
	res, err := c.Options(ctx, options_user.Endpoint)
	if err != nil {
		return err
	}

	if res.Status == 200 {
		// Response headers per status go in S200Headers
		_ = res.S200Headers.Allow // []string
	}
	return nil
}

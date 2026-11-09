package main

import (
	"context"

	"github.com/oldsheeep3/comatype/packages/go/c"
	"github.com/oldsheeep3/comatype/packages/go/comatype"
	user_put_id "example.com/app/comatype/user/put__id"
)

// Body is the request body of user/put__id.comat (UserData)
func UserPutId(ctx context.Context, id string, userInput user_put_id.Body) error {
	res, err := c.Put(ctx, user_put_id.Endpoint, user_put_id.Request{
		Params: user_put_id.Params{ID: comatype.Uuidv4(id)}, // uuidv4 is a custom type wrapping a string (comatype.Uuidv4). Validate() checks the format
		Body:   userInput,
	})
	if err != nil {
		return err
	}

	switch res.Status {
	case 200:
		_ = res.S200 // *user_put_id.S200Res (UserData)
	case 404:
		_ = res.S404 // *user_put_id.S404Res (ApiError)
	}
	return nil
}

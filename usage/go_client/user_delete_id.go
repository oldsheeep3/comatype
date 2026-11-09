package main

import (
	"context"

	"github.com/oldsheeep3/comatype/packages/go/c"
	"github.com/oldsheeep3/comatype/packages/go/comatype"
	user_delete_id "example.com/app/comatype/user/delete__id"
)

func UserDeleteId(ctx context.Context, id string) error {
	res, err := c.Delete(ctx, user_delete_id.Endpoint, user_delete_id.Request{
		Params: user_delete_id.Params{ID: comatype.Uuidv4(id)}, // uuidv4 is a custom type wrapping a string (comatype.Uuidv4). Validate() checks the format
	})
	if err != nil {
		return err
	}

	switch res.Status {
	case 204:
		// s204 is none, so there is no data, and res.S204 does not exist either
	case 404:
		_ = res.S404 // *user_delete_id.S404Res (ApiError)
	}
	return nil
}

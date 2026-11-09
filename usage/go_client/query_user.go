package main

import (
	"context"

	"github.com/oldsheeep3/comatype/packages/go/c"
	"example.com/app/comatype/query_user"
)

// Body is the request body of query_user.comat (Name, Email, Limit. All optional, so pointers)
func QueryUser(ctx context.Context, condition query_user.Body) error {
	// QUERY sends the search criteria in the body, so pass it the same way as c.Post()
	res, err := c.Query(ctx, query_user.Endpoint, condition)
	if err != nil {
		return err
	}

	if res.Status == 200 {
		_ = res.S200 // *query_user.S200Res ([]UserData)
	}
	return nil
}

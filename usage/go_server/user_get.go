package main

import (
	"github.com/oldsheeep3/comatype/packages/go/s"
	user_get "example.com/app/comatype/user/get"
)

func registerUserGet() {
	s.Get(user_get.Endpoint, func(req user_get.Request) user_get.Response {
		// req.Search.Limit: *int
		users := db.User.List(req.Search.Limit) // the app's own storage
		return user_get.S200((*user_get.S200Res)(&users))
	})
}

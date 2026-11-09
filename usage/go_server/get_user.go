package main

import (
	"github.com/oldsheeep3/comatype/packages/go/s"
	"example.com/app/comatype/get_user"
)

func registerGetUser() {
	s.Get(get_user.Endpoint, func(req get_user.Request) get_user.Response {
		// req.Params.ID: string, req.Search.Verbose: *bool
		user, ok := db.User.Find(req.Params.ID) // the app's own storage
		if !ok {
			return get_user.S404(&get_user.S404Res{Code: "not_found", Message: "user not found"})
		}
		return get_user.S200(&get_user.S200Res{Name: user.Name, Email: user.Email, Phone: user.Phone, UID: user.UID})
	})
}

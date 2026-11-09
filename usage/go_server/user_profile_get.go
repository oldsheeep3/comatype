package main

import (
	"github.com/oldsheeep3/comatype/packages/go/s"
	user_profile_get "example.com/app/comatype/user/profile/get"
)

func registerUserProfileGet() {
	s.Get(user_profile_get.Endpoint, func(req user_profile_get.Request) user_profile_get.Response {
		// wrap auth is on, so req.Ctx.User is readable through the AuthCtx declared in init
		u := req.Ctx.User
		return user_profile_get.S200(&user_profile_get.S200Res{Name: u.Name, Email: u.Email, Phone: u.Phone, UID: u.UID})
	})
}

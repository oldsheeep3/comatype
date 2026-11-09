package main

import (
	"github.com/oldsheeep3/comatype/packages/go/s"
	user_put_id "example.com/app/comatype/user/put__id"
)

func registerUserPutId() {
	s.Put(user_put_id.Endpoint, func(req user_put_id.Request) user_put_id.Response {
		// req.Params.ID: string, req.Body: UserData
		user, ok := db.User.Update(req.Params.ID, req.Body) // the app's own storage
		if !ok {
			return user_put_id.S404(&user_put_id.S404Res{Code: "not_found", Message: "user not found"})
		}
		return user_put_id.S200(&user_put_id.S200Res{Name: user.Name, Email: user.Email, Phone: user.Phone, UID: user.UID})
	})
}

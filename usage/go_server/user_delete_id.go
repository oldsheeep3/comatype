package main

import (
	"github.com/oldsheeep3/comatype/packages/go/s"
	user_delete_id "example.com/app/comatype/user/delete__id"
)

func registerUserDeleteId() {
	s.Delete(user_delete_id.Endpoint, func(req user_delete_id.Request) user_delete_id.Response {
		if !db.User.Delete(req.Params.ID) { // the app's own storage
			return user_delete_id.S404(&user_delete_id.S404Res{Code: "not_found", Message: "user not found"})
		}
		// none, so no arguments
		return user_delete_id.S204()
	})
}

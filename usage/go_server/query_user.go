package main

import (
	"github.com/oldsheeep3/comatype/packages/go/s"
	"example.com/app/comatype/query_user"
)

func registerQueryUser() {
	s.Query(query_user.Endpoint, func(req query_user.Request) query_user.Response {
		// req.Body: Name *string, Email *string, Limit *int
		users := db.User.Search(req.Body) // the app's own storage
		// S200Res is []UserData (an array type, not a struct)
		return query_user.S200((*query_user.S200Res)(&users))
	})
}

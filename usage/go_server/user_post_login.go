package main

import (
	"github.com/oldsheeep3/comatype/packages/go/comatype"
	"github.com/oldsheeep3/comatype/packages/go/s"
	user_post_login "example.com/app/comatype/user/post_login"
)

// wrap auth is off, so it is called even when not logged in
func registerUserPostLogin() {
	s.Post(user_post_login.Endpoint, func(req user_post_login.Request) user_post_login.Response {
		user, ok := verifyPassword(req.Body.Email, req.Body.Password) // the app's own logic
		if !ok {
			return user_post_login.S401(&user_post_login.S401Res{Code: "invalid_credentials", Message: "email or password is wrong"})
		}
		token := createSession(user.UID) // the app's own logic
		// WithCookie: issues the `cookie session { ... }` of init.comat (httpOnly / secure / sameSite come from init.comat)
		//   comatype.MaxAge(seconds) / comatype.Expires(t) / comatype.CookiePath(p) / comatype.CookieDomain(d) change only this issue
		//   ClearCookie() deletes it. Endpoints with cookie off have no WithCookie
		return user_post_login.S200(&user_post_login.S200Res{UID: user.UID}).WithCookie(token, comatype.MaxAge(3600))
	})
}

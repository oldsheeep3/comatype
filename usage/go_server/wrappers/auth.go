package wrappers

import (
	"github.com/oldsheeep3/comatype/packages/go/s"
	// Package generated from init.comat: the ctx type (AuthCtx) and the statuses a wrapper can return (S401)
	comatype_init "example.com/app/comatype/init"
)

// Auth implements the `wrapper auth` of init.comat. Export it as a ComatypeWrap value
// ComatypeWrap[comatype_init.AuthCtx]: on endpoints with `wrap auth` on, a handler can read req.Ctx.User, typed
var Auth s.ComatypeWrap[comatype_init.AuthCtx] = func(req *s.RawRequest[comatype_init.AuthCtx], next s.Next[comatype_init.AuthCtx]) s.RawResponse {
	user, ok := verifySession(req.Cookie("session")) // the app's own logic
	if !ok {
		return comatype_init.S401(&comatype_init.S401Res{Code: "unauthorized", Message: "login required"})
	}
	req.Ctx = comatype_init.AuthCtx{User: user}
	return next(req)
}

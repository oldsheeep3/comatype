package wrappers

import "github.com/oldsheeep3/comatype/packages/go/c"

// Auth implements the `wrapper auth` of init.comat. Export it as a ComatypeWrap value
var Auth c.ComatypeWrap = func(req *c.RawRequest, next c.Next) (*c.RawResponse, error) {
	req.Header.Set("Authorization", "Bearer "+getToken()) // the app's own logic
	return next(req)
}

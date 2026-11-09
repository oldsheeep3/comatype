import Comatype
import ComatypeGen
import Foundation

func registerUserProfileGet(_ s: S) {
    s.get(UserProfileGet.endpoint) { req in
        // wrap auth is on, so the ctx added by the wrapper is readable
        S.Reply(.s200(body: req.ctx.auth.user))
    }
}

// Implement a wrapper as an S.ComatypeWrap<AuthCtx> value (corresponds to the `wrapper auth` of init.comat)
import Comatype
import ComatypeGen

let auth: S.ComatypeWrap<ComatypeInit.AuthCtx> = { req, next in
    guard let user = verifySession(req.cookie("session")) else { // the app's own logic
        return ComatypeInit.s401(ApiError(code: "unauthorized", message: "login required"))
    }
    // On endpoints with `wrap auth` on, a handler can read req.ctx.auth.user, typed
    return try await next(req.withCtx(ComatypeInit.AuthCtx(user: user)))
}

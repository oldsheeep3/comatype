// Implement a wrapper as a suspend function (SWrap<AuthCtx>) value (corresponds to the `wrapper auth` of init.comat)
import comatype.gen.Init
import comatype.gen.Types
import comatype.ktx.SWrap

val auth: SWrap<Init.AuthCtx> = { req, next ->
    val user = verifySession(req.cookie("session")) // the app's own logic
    if (user == null) {
        Init.s401(Types.ApiError("unauthorized", "login required"))
    } else {
        // On endpoints with `wrap auth` on, a handler can read req.ctx.auth.user, typed
        next(req.withCtx(Init.AuthCtx(user)))
    }
}

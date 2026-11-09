// Implement a wrapper as a ComatypeWrap<AuthCtx> value (corresponds to the `wrapper auth` of init.comat)
use crate::comatype_gen::init::{s401, AuthCtx};
use crate::comatype_gen::types::ApiError;
use comatype::s::ComatypeWrap;

pub fn auth() -> ComatypeWrap<AuthCtx> {
    ComatypeWrap::new(|req, next| {
        // On endpoints with `wrap auth` on, a handler can read req.ctx.auth.user, typed
        let Some(user) = crate::verify_session(req.cookie("session")) else {
            return s401(ApiError { code: "unauthorized".into(), message: "login required".into() });
        };
        next(req.with_ctx(AuthCtx { user }))
    })
}

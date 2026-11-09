# Implement a wrapper as a value of type ComatypeWrap and export it (corresponds to the `wrapper auth` of init.comat)
from comatype import ComatypeWrap

# Module generated from init.comat: the ctx type (AuthCtx) and the statuses a wrapper can return (S401)
from comatype_gen.comatype_init import AuthCtx, S401


async def _auth(req, next):
    user = await verify_session(req.cookies.get("session"))  # the app's own logic
    if user is None:
        return S401(error=S401.Res(code="unauthorized", message="login required"))
    req.ctx = AuthCtx(user=user)
    return await next(req)


# ComatypeWrap[AuthCtx]: on endpoints with `wrap auth` on, a handler can read req.ctx.user, typed
auth = ComatypeWrap[AuthCtx](_auth)

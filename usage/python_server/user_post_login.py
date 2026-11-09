from comatype import Cookie, s
from comatype_gen.user.post_login import path, S200, S401, Request


# wrap auth is off, so it is called even when not logged in
@s.post(path)
async def user_post_login(req: Request):
    user = await verify_password(req.body.email, req.body.password)  # the app's own logic
    if user is None:
        return S401(error=S401.Res(code="invalid_credentials", message="email or password is wrong"))
    token = await create_session(user.uid)  # the app's own logic
    # cookie: issues the `cookie session { ... }` of init.comat (httpOnly / secure / sameSite come from init.comat)
    #   string               -> Set-Cookie with that value
    #   Cookie(value, max_age=seconds, expires=..., path=..., domain=...) -> changes only this issue
    #   Cookie.clear()       -> delete it. The S200 of an endpoint with cookie off has no cookie argument
    return S200(data=S200.Res(uid=user.uid), cookie=Cookie(token, max_age=3600))

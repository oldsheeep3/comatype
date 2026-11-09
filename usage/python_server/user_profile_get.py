from comatype import s
from comatype_gen.user.profile.get import path, S200, Request


@s.get(path)
async def user_profile_get(req: Request):
    # wrap auth is on, so the fields of the AuthCtx declared in init are readable as req.ctx.user (typed)
    return S200(data=req.ctx.user)

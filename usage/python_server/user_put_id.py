from comatype import s
from comatype_gen.user.put__id import path, S200, S404, Request


@s.put(path)
async def user_put_id(req: Request):
    # req.params.id: str, req.body: UserData
    user = await db.user.update(req.params.id, req.body)  # the app's own storage
    if user is None:
        return S404(error=S404.Res(code="not_found", message="user not found"))
    return S200(data=user)

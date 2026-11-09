from comatype import s
from comatype_gen.user.delete__id import path, S204, S404, Request


@s.delete(path)
async def user_delete_id(req: Request):
    if not await db.user.delete(req.params.id):  # the app's own storage
        return S404(error=S404.Res(code="not_found", message="user not found"))
    # none, so no arguments
    return S204()

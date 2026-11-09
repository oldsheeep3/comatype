from comatype import s
from comatype_gen.get_user import path, S200, S404, Request


@s.get(path)
async def get_user(req: Request):
    # req.params.id: str (uuidv4), req.search.verbose: Optional[bool]
    user = await db.user.find(req.params.id)  # the app's own storage
    if user is None:
        return S404(error=S404.Res(code="not_found", message="user not found"))
    return S200(data=user)

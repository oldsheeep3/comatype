from comatype import s
from comatype_gen.user.get import path, S200, Request


@s.get(path)
async def user_get(req: Request):
    # req.search.limit: Optional[int]
    users = await db.user.list(limit=req.search.limit)  # the app's own storage
    return S200(data=users)

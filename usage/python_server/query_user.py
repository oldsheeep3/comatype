from comatype import s
from comatype_gen.query_user import path, S200, Request


@s.query(path)
async def query_user(req: Request):
    # req.body: name / email / limit (all Optional)
    users = await db.user.search(req.body)  # the app's own storage
    # S200.Res is list[UserData]
    return S200(data=users)

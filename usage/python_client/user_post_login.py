from comatype import c
# user/post_login.comat -> POST /user/login (what follows `_` is a static segment)
from comatype_gen.user.post_login import path, Body, S200, S401


async def user_post_login(input: Body) -> None:
    res = await c.post(path, input, S200, S401)

    match res.status:
        case 200:
            res.data.uid  # uuid.UUID
        case 401:
            res.error  # ApiError

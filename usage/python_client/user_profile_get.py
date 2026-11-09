from comatype import c
# user/profile/get.comat -> GET /user/profile (a nested directory)
from comatype_gen.user.profile.get import path, S200


async def user_profile_get() -> None:
    # There are no params / search / body, so no request argument is needed
    res = await c.get(path, S200)

    match res.status:
        case 200:
            res.data  # UserData

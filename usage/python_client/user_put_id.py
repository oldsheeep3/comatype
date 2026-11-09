from uuid import UUID

from comatype import c
from comatype_gen.user.put__id import path, S200, Body, S404, Request, Params


# Body is the request body of user/put__id.comat (UserData)
async def user_put_id(id: str, user_input: Body) -> None:
    res = await c.put(path, Request(params=Params(id=UUID(id)), body=user_input), S200, S404)

    match res.status:
        case 200:
            res.data  # UserData
        case 404:
            res.error  # ApiError

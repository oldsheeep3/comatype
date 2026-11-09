from uuid import UUID

from comatype import c
from comatype_gen.get_user import path, S200, S404, Request, Params, Search


async def get_user(id: str) -> None:
    # Request has params and search, typed from the params / search blocks of get_user.comat
    # Request is the same type on the client and the server
    res = await c.get(path, Request(params=Params(id=UUID(id)), search=Search(verbose=True)), S200, S404)

    match res.status:
        case 200:
            res.data  # UserData
        case 404:
            res.error  # ApiError

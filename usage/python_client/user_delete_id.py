from uuid import UUID

from comatype import c
from comatype_gen.user.delete__id import path, S204, S404, Request, Params


async def user_delete_id(id: str) -> None:
    # delete is not a reserved word in python
    res = await c.delete(path, Request(params=Params(id=UUID(id))), S204, S404)

    match res.status:
        case 204:
            pass  # there is no data
        case 404:
            res.error  # ApiError

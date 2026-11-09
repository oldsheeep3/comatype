from comatype import c
# user/get.comat -> GET /user (a file named only after the method is the path of the directory itself)
from comatype_gen.user.get import path, S200, Request, Search


async def user_get(limit: int) -> None:
    # search is the search block of get.comat (limit?: int)
    res = await c.get(path, Request(search=Search(limit=limit)), S200)

    match res.status:
        case 200:
            res.data  # list[UserData]

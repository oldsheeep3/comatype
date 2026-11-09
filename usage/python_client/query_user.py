from comatype import c
from comatype_gen.query_user import path, S200, Body


# Body is the request body of query_user.comat (name / email / limit. All Optional)
async def query_user(condition: Body) -> None:
    # QUERY sends the search criteria in the body, so pass it the same way as c.post()
    res = await c.query(path, condition, S200)

    match res.status:
        case 200:
            res.data  # list[UserData]

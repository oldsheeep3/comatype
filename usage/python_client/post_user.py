# c is the client side, s is the server side (see ../python_server/post_user.py)
# Call the methods as c.post() / c.get() / c.put() / c.delete() / c.options() / c.query()
from comatype import c

# Module generated from post_user.comat by `comatype generate --lang python`
#   path  : the endpoint's path
#   Body  : the request body (the `body` line). A pydantic model
#   S200  : status 200. A class that builds the response, and S200.Res is the type of the response body
# Status names are S[status code] (S200, S401, ...), because Python classes are PascalCase
from comatype_gen.post_user import path, Body, S200


async def post_user(user_input: Body) -> None:
    # c.post(path, body, success status, *error statuses)
    # The body is validated before sending (including email / phone / uuidv4), and the response body after receiving
    res = await c.post(path, user_input, S200)

    # post_user.comat has only S200, so status is only 200
    # 2** is res.data (S200.Res. None if the server sends no body), everything else is res.error
    # Passing S401, S404, etc. to *error makes status a union of Literals (narrow it with match / if)
    match res.status:
        case 200:
            res.data

# s is the server side, c is the client side (see ../python_client/post_user.py)
# Use the methods as @s.post() / @s.get() / @s.put() / @s.delete() / @s.options() / @s.query()
from comatype import s

# Module generated from post_user.comat by `comatype generate --lang python`
# Request is the whole request (params, search, body)
from comatype_gen.post_user import path, S200, Request


@s.post(path)
async def post_user(req: Request):
    # req.body is the data sent by the client: Body (UserData). Already validated
    user = req.body

    # S200(...) builds a response with status 200
    # S200.Res is the response body (UserData without uid). uid is omitted along with its key and must not be sent
    return S200(
        data=S200.Res(name=user.name, email=user.email, phone=user.phone),
    )

    # To return only the status code, S200() does the same
    # The response body is nullable, so S200() without data is allowed

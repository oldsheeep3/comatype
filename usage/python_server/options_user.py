from comatype import s
from comatype_gen.options_user import path, S200, Request


# There are no params / search / body, so the handler has no request to read
@s.options(path)
async def options_user(req: Request):
    # The body is none, so there is no data; only the response headers are returned
    return S200(headers=S200.Headers(allow=["GET", "POST", "PUT", "DELETE", "OPTIONS", "QUERY"]))

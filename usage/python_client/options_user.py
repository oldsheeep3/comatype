from comatype import c
from comatype_gen.options_user import path, S200


async def options_user() -> None:
    # There are no params / search / body, so no request argument is needed
    res = await c.options(path, S200)

    match res.status:
        case 200:
            # The second block of s200 (response headers) goes in res.headers
            res.headers.allow  # list[str]

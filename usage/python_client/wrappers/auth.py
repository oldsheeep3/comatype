# Implement a wrapper as a value of type ComatypeWrap and export it (corresponds to the `wrapper auth` of init.comat)
from comatype import ComatypeWrap


async def _auth(req, next):
    req.headers["Authorization"] = f"Bearer {get_token()}"  # the app's own logic
    return await next(req)


auth = ComatypeWrap(_auth)

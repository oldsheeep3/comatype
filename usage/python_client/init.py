# Client init file: import and pass the implemented ComatypeWrap
# The base url defaults to baseUrl in init.comat. Override with the COMATYPE_BASE_URL environment variable or base_url
# Call init_comatype() once at startup (whether a wrapper is on or off is decided by defaults.comat and `wrap` in each .comat)
from comatype import c

# Module generated from init.comat
from comatype_gen.comatype_init import Wrappers

from wrappers.auth import auth


def init_comatype() -> None:
    c.init(
        # With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a type-check error
        wrappers=Wrappers(auth=auth),
        # Used by `cookie on` endpoints. The cookie jar keeps the httpOnly cookie
        cookies=True,
    )

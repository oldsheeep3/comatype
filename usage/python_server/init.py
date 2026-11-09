# Server init file: import and pass the implemented ComatypeWrap
# The cookie settings (name, httpOnly, etc.) are in init.comat
from comatype import s

# Module generated from init.comat
from comatype_gen.comatype_init import Wrappers

from wrappers.auth import auth


def init_comatype() -> None:
    # With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a type-check error
    s.init(wrappers=Wrappers(auth=auth))

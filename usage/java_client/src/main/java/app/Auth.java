package app;

import comatype.C;

/** Implement a wrapper as a C.ComatypeWrap value (corresponds to the `wrapper auth` of init.comat) */
public final class Auth {
    private Auth() {}

    public static final C.ComatypeWrap auth = (req, next) -> {
        req.headers.set("Authorization", "Bearer " + System.getenv("API_TOKEN"));
        return next.call(req);
    };
}

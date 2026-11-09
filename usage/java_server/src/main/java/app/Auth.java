package app;

import comatype.S;
import comatype.gen.Init;
import comatype.gen.Types;

/** Implement a wrapper as an S.ComatypeWrap<AuthCtx> value (corresponds to the `wrapper auth` of init.comat) */
public final class Auth {
    private Auth() {}

    public static final S.ComatypeWrap<Init.AuthCtx> auth = (req, next) -> {
        Types.UserData user = verifySession(req.cookie("session")); // the app's own logic
        if (user == null) return Init.s401(new Types.ApiError("unauthorized", "login required"));
        // On endpoints with `wrap auth` on, a handler can read req.ctx().auth().user(), typed
        return next.call(req.withCtx(new Init.AuthCtx(user)));
    };

    static Types.UserData verifySession(String session) {
        return null;
    }
}

// Implement a wrapper as an S.ComatypeWrap<AuthCtx> value (corresponds to the `wrapper auth` of init.comat)
using Comatype;
using ComatypeGen;

public static class Auth
{
    public static readonly S.ComatypeWrap<Init.AuthCtx> Wrap = (req, next) =>
    {
        Types.UserData? user = VerifySession(req.Cookie("session")); // the app's own logic
        if (user == null)
            return Task.FromResult(Init.S401(new Types.ApiError("unauthorized", "login required")));
        // On endpoints with `wrap auth` on, a handler can read req.Ctx.Auth.User, typed
        return next(req.WithCtx(new Init.AuthCtx(user)));
    };

    private static Types.UserData? VerifySession(string? token) => null;
}

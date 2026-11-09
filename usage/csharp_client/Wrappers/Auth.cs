// Implement a wrapper as a C.ComatypeWrap value (corresponds to the `wrapper auth` of init.comat)
using Comatype;

public static class Auth
{
    public static readonly C.ComatypeWrap Wrap = (req, next) =>
    {
        req.Headers.Set("Authorization", "Bearer " + Environment.GetEnvironmentVariable("API_TOKEN"));
        return next(req);
    };
}

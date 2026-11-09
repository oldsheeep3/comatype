using Comatype;
using ComatypeGen;

public static class UserPutIdHandler
{
    public static void Register(S s)
    {
        s.Put(
            UserPutId.Endpoint,
            req =>
            {
                // req.Params.Id: Guid, req.Body: Types.UserData, req.Ctx.Auth.User (wrap auth is on)
                Types.UserData? user = Db.User.Update(req.Params.Id, req.Body); // the app's own storage
                if (user == null)
                    return new UserPutId.S404(new Types.ApiError("not_found", "user not found"), UserPutId.S404Headers.Empty());
                // headerRes (X-Resource-Version) of user/defaults.comat
                return new UserPutId.S200(user, UserPutId.S200Headers.Empty() with { XResourceVersion = "v2" });
            }
        );
    }
}

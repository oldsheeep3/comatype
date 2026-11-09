using Comatype;
using ComatypeGen;

public static class UserPutIdSample
{
    public static async Task PutUser(Guid id, Types.UserData user)
    {
        // Request has params / headers / body, typed from the params block of put_[id].comat
        UserPutId.Response res = await C.PutAsync(
            UserPutId.Endpoint,
            new UserPutId.Request(new UserPutId.Params(id), UserPutId.RequestHeaders.Empty(), user)
        );

        switch (res)
        {
            case UserPutId.S200 ok:
                Types.UserData data = ok.Body; // ok.Headers is S200Headers
                break;
            case UserPutId.S404 notFound:
                Types.ApiError error = notFound.Body;
                break;
        }
    }
}

package app;

import comatype.C;
import comatype.gen.Types;
import comatype.gen.UserPutId;

public final class Api {
    private Api() {}

    /** PUT /user/:id. Request has params / headers / body, typed from the params block of put__id.comat */
    public static void putUser(java.util.UUID id, Types.UserData user) {
        UserPutId.Response res = C.put(UserPutId.ENDPOINT,
                new UserPutId.Request(new UserPutId.Params(id), UserPutId.RequestHeaders.empty(), user));

        if (res instanceof UserPutId.S200 ok) {
            Types.UserData data = ok.body(); // ok.headers() is S200Headers
        } else if (res instanceof UserPutId.S404 notFound) {
            Types.ApiError error = notFound.body();
        }
    }
}

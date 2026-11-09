package app;

import comatype.S;
import comatype.gen.Types;
import comatype.gen.UserPutId;

public final class UserPutIdHandler {
    private UserPutIdHandler() {}

    public static void register(S s, Db db) {
        s.put(UserPutId.ENDPOINT, req -> {
            // req.params().id(): UUID, req.body(): UserData, req.ctx().auth().user() (wrap auth is on)
            Types.UserData user = db.update(req.params().id(), req.body()); // the app's own storage
            if (user == null) {
                return S.Reply.of(new UserPutId.S404(new Types.ApiError("not_found", "user not found"), UserPutId.S404Headers.empty()));
            }
            // headerRes (X-Resource-Version) of user/defaults.comat
            return S.Reply.of(new UserPutId.S200(user, UserPutId.S200Headers.empty().withXResourceVersion("v2")));
        });
    }

    /** the app's own storage */
    public interface Db {
        Types.UserData update(java.util.UUID id, Types.UserData user);
    }
}

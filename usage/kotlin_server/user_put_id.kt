import comatype.S
import comatype.gen.Types
import comatype.gen.UserPutId
import comatype.ktx.coPut

fun S.userPutId() {
    // The handler is a suspend function. The returned Reply is used to add a cookie (S.Reply.of(res).withCookie(...))
    coPut(UserPutId.ENDPOINT) { req ->
        // req.params.id: UUID, req.body: UserData, req.ctx.auth.user (wrap auth is on)
        val user = db.user.update(req.params.id, req.body) // the app's own storage
            ?: return@coPut S.Reply.of<UserPutId.Response>(UserPutId.S404(Types.ApiError("not_found", "user not found")))
        // headerRes (X-Resource-Version) of user/defaults.comat
        S.Reply.of<UserPutId.Response>(UserPutId.S200(user, UserPutId.S200Headers(xResourceVersion = "v2")))
    }
}

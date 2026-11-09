import comatype.S
import comatype.gen.*
import comatype.ktx.*

fun S.userDeleteId() {
    coDelete(UserDeleteId.ENDPOINT) { req ->
        val ok = db.user.delete(req.params.id)
        S.Reply.of<UserDeleteId.Response>(if (ok) UserDeleteId.S204() else UserDeleteId.S404(Types.ApiError("not_found", "user not found")))
    }
}

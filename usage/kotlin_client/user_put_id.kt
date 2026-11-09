import comatype.ktx.CK
import comatype.gen.Types
import comatype.gen.UserPutId

suspend fun putUser(id: java.util.UUID, user: Types.UserData) {
    // Request has params / headers / body, typed from the params block of put__id.comat
    val res = CK.put(UserPutId.ENDPOINT, UserPutId.Request(params = UserPutId.Params(id), body = user))

    when (res) {
        is UserPutId.S200 -> res.body // UserData (res.headers is S200Headers)
        is UserPutId.S404 -> res.body // ApiError
        else -> {}
    }
}

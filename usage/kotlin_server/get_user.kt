import comatype.S
import comatype.gen.*
import comatype.ktx.*

fun S.getUser() {
    coGet(GetUser.ENDPOINT) { req ->
        // req.params.id: UUID, req.search.verbose: Boolean?
        val user = db.user.find(req.params.id) // the app's own storage
        S.Reply.of<GetUser.Response>(if (user == null) GetUser.S404(Types.ApiError("not_found", "user not found")) else GetUser.S200(user))
    }
}

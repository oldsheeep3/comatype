import comatype.S
import comatype.gen.*
import comatype.ktx.*

fun S.userGet() {
    coGet(UserGet.ENDPOINT) { req ->
        // req.search.limit: Long?
        S.Reply.of<UserGet.Response>(UserGet.S200(db.user.list(req.search.limit)))
    }
}

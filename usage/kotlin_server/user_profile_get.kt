import comatype.S
import comatype.gen.*
import comatype.ktx.*

fun S.userProfileGet() {
    coGet(UserProfileGet.ENDPOINT) { req ->
        // wrap auth is on, so the ctx added by the wrapper is readable
        S.Reply.of<UserProfileGet.Response>(UserProfileGet.S200(req.ctx.auth.user))
    }
}

import comatype.S
import comatype.gen.*
import comatype.ktx.*

fun S.userPostLogin() {
    coPost(UserPostLogin.ENDPOINT) { req ->
        val uid = db.user.verify(req.body.email, req.body.password) // the app's own logic
            ?: return@coPost S.Reply.of<UserPostLogin.Response>(UserPostLogin.S401(Types.ApiError("bad", "wrong")))
        // Issue a Set-Cookie with the cookie settings of init.comat (httpOnly etc.)
        S.Reply.of<UserPostLogin.Response>(UserPostLogin.S200(UserPostLogin.S200Res(uid))).withCookie(comatype.CookieValue.of(newSession(uid)).maxAge(3600))
    }
}

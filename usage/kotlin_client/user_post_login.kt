import comatype.Email
import comatype.Phone
import comatype.gen.*
import comatype.ktx.CK
import java.util.UUID

/** POST /user/login (on success the server issues a Set-Cookie and the cookie jar keeps it) */
suspend fun login(email: String, password: String) =
    CK.post(UserPostLogin.ENDPOINT, UserPostLogin.Request(body = UserPostLogin.Body(Email(email), password)))

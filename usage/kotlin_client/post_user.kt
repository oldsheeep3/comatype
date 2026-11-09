import comatype.Email
import comatype.Phone
import comatype.gen.*
import comatype.ktx.CK
import java.util.UUID

/** POST /user (sign up. The body is Body, and it has no uid) */
suspend fun postUser(name: String, email: String, phone: String) =
    CK.post(PostUser.ENDPOINT, PostUser.Request(body = PostUser.Body(name, Email(email), Phone(phone))))

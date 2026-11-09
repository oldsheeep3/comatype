import comatype.Email
import comatype.Phone
import comatype.gen.*
import comatype.ktx.CK
import java.util.UUID

/** GET /user/profile (wrap auth is on, so 401 without login) */
suspend fun getProfile() = CK.get(UserProfileGet.ENDPOINT, UserProfileGet.Request())

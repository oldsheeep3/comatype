import comatype.Email
import comatype.Phone
import comatype.gen.*
import comatype.ktx.CK
import java.util.UUID

/** DELETE /user/:id */
suspend fun deleteUser(id: UUID) = CK.delete(UserDeleteId.ENDPOINT, UserDeleteId.Request(params = UserDeleteId.Params(id)))

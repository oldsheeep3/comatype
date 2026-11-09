import comatype.Email
import comatype.Phone
import comatype.gen.*
import comatype.ktx.CK
import java.util.UUID

/** GET /user?limit= (user/get.comat. A file named only after the method points at the directory itself, /user) */
suspend fun listUsers(limit: Long? = null) = CK.get(UserGet.ENDPOINT, UserGet.Request(search = UserGet.Search(limit = limit)))

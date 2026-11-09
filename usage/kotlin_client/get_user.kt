import comatype.Email
import comatype.Phone
import comatype.gen.*
import comatype.ktx.CK
import java.util.UUID

/** GET /user/:id (it has params and search, so pass a Request) */
suspend fun getUser(id: UUID, verbose: Boolean? = null) =
    CK.get(GetUser.ENDPOINT, GetUser.Request(params = GetUser.Params(id), search = GetUser.Search(verbose = verbose)))

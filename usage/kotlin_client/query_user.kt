import comatype.Email
import comatype.Phone
import comatype.gen.*
import comatype.ktx.CK
import java.util.UUID

/** QUERY /user (send the search criteria in the body) */
suspend fun queryUsers(name: String?) = CK.query(QueryUser.ENDPOINT, QueryUser.Request(body = QueryUser.Body(name = name)))

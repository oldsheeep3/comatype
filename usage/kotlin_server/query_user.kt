import comatype.S
import comatype.gen.*
import comatype.ktx.*

fun S.queryUser() {
    coQuery(QueryUser.ENDPOINT) { req ->
        // QUERY takes the search criteria in the body (req.body.name)
        S.Reply.of<QueryUser.Response>(QueryUser.S200(db.user.search(req.body.name)))
    }
}

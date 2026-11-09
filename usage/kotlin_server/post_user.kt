import comatype.S
import comatype.gen.*
import comatype.ktx.*

fun S.postUser() {
    coPost(PostUser.ENDPOINT) { req ->
        // req.body: PostUser.Body (no uid). The server decides uid
        S.Reply.of<PostUser.Response>(PostUser.S200(db.user.create(req.body.name, req.body.email, req.body.phone)))
    }
}

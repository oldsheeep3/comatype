import Comatype
import ComatypeGen
import Foundation

func registerPostUser(_ s: S) {
    s.post(PostUser.endpoint) { req in
        // req.body: PostUser.Body (no uid). The server decides uid
        S.Reply(.s200(body: db.user.create(req.body.name, req.body.email, req.body.phone)))
    }
}

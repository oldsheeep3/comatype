import Comatype
import ComatypeGen
import Foundation

func registerUserGet(_ s: S) {
    s.get(UserGet.endpoint) { req in
        // req.search.limit: Int?
        S.Reply(.s200(body: db.user.list(req.search.limit)))
    }
}

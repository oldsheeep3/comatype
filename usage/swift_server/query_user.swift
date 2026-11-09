import Comatype
import ComatypeGen
import Foundation

func registerQueryUser(_ s: S) {
    s.query(QueryUser.endpoint) { req in
        // QUERY takes the search criteria in the body (req.body.name)
        S.Reply(.s200(body: db.user.search(req.body.name)))
    }
}

import Comatype
import ComatypeGen
import Foundation

func registerGetUser(_ s: S) {
    s.get(GetUser.endpoint) { req in
        // req.params.id: UUID, req.search.verbose: Bool?
        guard let user = db.user.find(req.params.id) else { // the app's own storage
            return S.Reply(.s404(body: ApiError(code: "not_found", message: "user not found")))
        }
        return S.Reply(.s200(body: user))
    }
}

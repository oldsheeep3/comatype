import Comatype
import ComatypeGen
import Foundation

func registerUserDeleteId(_ s: S) {
    s.delete(UserDeleteId.endpoint) { req in
        guard db.user.delete(req.params.id) else {
            return S.Reply(.s404(body: ApiError(code: "not_found", message: "user not found")))
        }
        return S.Reply(.s204())
    }
}

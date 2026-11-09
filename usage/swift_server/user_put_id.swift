import Comatype
import ComatypeGen

func registerUserPutId(_ s: S) {
    s.put(UserPutId.endpoint) { req in
        // req.params.id: UUID, req.body: UserData, req.ctx.auth.user (wrap auth is on)
        guard let user = db.user.update(req.params.id, req.body) else { // the app's own storage
            return S.Reply(.s404(body: ApiError(code: "not_found", message: "user not found")))
        }
        // headerRes (X-Resource-Version) of user/defaults.comat
        return S.Reply(.s200(body: user, headers: UserPutId.S200Headers(xResourceVersion: "v2")))
    }
}

import Comatype
import ComatypeGen
import Foundation

func registerUserPostLogin(_ s: S) {
    s.post(UserPostLogin.endpoint) { req in
        guard let uid = db.user.verify(req.body.email, req.body.password) else { // the app's own logic
            return S.Reply(.s401(body: ApiError(code: "bad", message: "wrong")))
        }
        // Issue a Set-Cookie with the cookie settings of init.comat (httpOnly etc.)
        return S.Reply(.s200(body: UserPostLogin.S200Res(uid: uid))).withCookie(CookieValue(newSession(uid), maxAge: 3600))
    }
}

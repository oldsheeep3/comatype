import Comatype
import ComatypeGen
import Foundation

/// POST /user/login (on success the server issues a Set-Cookie and the cookie jar keeps it)
func login(email: String, password: String) async throws -> UserPostLogin.Response {
    try await C.post(UserPostLogin.endpoint, UserPostLogin.Request(body: .init(email: Email(email), password: password)))
}

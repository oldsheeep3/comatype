import Comatype
import ComatypeGen
import Foundation

/// POST /user (sign up. The body is Body, and it has no uid)
func postUser(name: String, email: String, phone: String) async throws -> PostUser.Response {
    try await C.post(PostUser.endpoint, PostUser.Request(body: .init(name: name, email: Email(email), phone: Phone(phone))))
}

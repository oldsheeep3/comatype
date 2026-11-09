import Comatype
import ComatypeGen
import Foundation

/// GET /user?limit= (user/get.comat. A file named only after the method points at the directory itself, /user)
func listUsers(limit: Int? = nil) async throws -> UserGet.Response {
    try await C.get(UserGet.endpoint, UserGet.Request(search: .init(limit: limit)))
}

import Comatype
import ComatypeGen
import Foundation

/// DELETE /user/:id
func deleteUser(id: UUID) async throws -> UserDeleteId.Response {
    try await C.delete(UserDeleteId.endpoint, UserDeleteId.Request(params: .init(id: id)))
}

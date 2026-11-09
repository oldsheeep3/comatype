import Comatype
import ComatypeGen
import Foundation

/// GET /user/:id (it has params and search, so pass a Request)
func getUser(id: UUID, verbose: Bool? = nil) async throws -> GetUser.Response {
    try await C.get(GetUser.endpoint, GetUser.Request(params: .init(id: id), search: .init(verbose: verbose)))
}

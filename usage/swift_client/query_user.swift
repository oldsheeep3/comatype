import Comatype
import ComatypeGen
import Foundation

/// QUERY /user (send the search criteria in the body)
func queryUsers(name: String?) async throws -> QueryUser.Response {
    try await C.query(QueryUser.endpoint, QueryUser.Request(body: .init(name: name)))
}

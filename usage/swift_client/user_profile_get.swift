import Comatype
import ComatypeGen
import Foundation

/// GET /user/profile (wrap auth is on, so 401 without login)
func getProfile() async throws -> UserProfileGet.Response {
    try await C.get(UserProfileGet.endpoint, UserProfileGet.Request())
}

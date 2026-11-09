import Comatype
import ComatypeGen
import Foundation

/// OPTIONS /user (there are no params / search / body, so just Request())
func optionsUser() async throws -> OptionsUser.Response {
    try await C.options(OptionsUser.endpoint, OptionsUser.Request())
}

import Comatype
import ComatypeGen
import Foundation

func putUser(id: UUID, user: UserData) async throws {
    // Request has params / headers / body, typed from the params block of put__id.comat
    let res = try await C.put(UserPutId.endpoint, UserPutId.Request(params: .init(id: id), body: user))

    switch res {
    case .s200(let data, _): _ = data   // UserData (the second is S200Headers)
    case .s404(let error, _): _ = error // ApiError
    default: break
    }
}

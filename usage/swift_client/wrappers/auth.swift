// Implement a wrapper as a C.ComatypeWrap value (corresponds to the `wrapper auth` of init.comat)
import Comatype
import Foundation

let auth: C.ComatypeWrap = { req, next in
    var r = req
    r.headers.set("Authorization", "Bearer \(ProcessInfo.processInfo.environment["API_TOKEN"] ?? "")")
    return try await next(r)
}

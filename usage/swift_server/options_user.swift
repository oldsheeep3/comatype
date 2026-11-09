import Comatype
import ComatypeGen
import Foundation

func registerOptionsUser(_ s: S) {
    s.options(OptionsUser.endpoint) { _ in
        // No body; return only the Allow header
        S.Reply(.s200(headers: OptionsUser.S200Headers(allow: ["GET", "POST", "OPTIONS"])))
    }
}

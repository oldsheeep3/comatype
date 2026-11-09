import Foundation

/// Input or output does not match a .comat type.
public struct ValidationError: Error, CustomStringConvertible {
    public let path: String
    public let reason: String

    public init(path: String, reason: String) {
        self.path = path
        self.reason = reason
    }

    public var description: String { path.isEmpty ? reason : "\(path): \(reason)" }

    public static func join(_ path: String, _ name: String) -> String { path.isEmpty ? name : "\(path).\(name)" }
}

/// Errors thrown by the runtime.
public enum ComatypeError: Error, CustomStringConvertible {
    /// A status not declared in .comat was returned
    case unexpectedStatus(status: Int, body: Data)
    /// Misconfiguration (wrapper not passed, no base url, etc.)
    case config(String)
    /// The network call failed
    case transport(String)
    /// The server's own error
    case `internal`(String)

    public var description: String {
        switch self {
        case let .unexpectedStatus(status, _): return "想定していないステータス \(status) が返りました"
        case let .config(m), let .transport(m), let .internal(m): return m
        }
    }
}

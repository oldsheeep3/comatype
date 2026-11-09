import Foundation

/// `cookie <name> { ... }` in init.comat.
public struct CookieDef {
    public let name: String
    public let httpOnly: Bool
    public let secure: Bool
    /// lax | strict | none
    public let sameSite: String?
    public let path: String?
    public let domain: String?
    public let maxAge: Int?

    public init(name: String, httpOnly: Bool, secure: Bool, sameSite: String?, path: String?, domain: String?, maxAge: Int?) {
        self.name = name
        self.httpOnly = httpOnly
        self.secure = secure
        self.sameSite = sameSite
        self.path = path
        self.domain = domain
        self.maxAge = maxAge
    }
}

/// A cookie to issue.
public struct CookieValue {
    public var value: String
    public var delete: Bool
    public var maxAge: Int?
    public var path: String?
    public var domain: String?

    public init(_ value: String, maxAge: Int? = nil, path: String? = nil, domain: String? = nil) {
        self.value = value
        self.delete = false
        self.maxAge = maxAge
        self.path = path
        self.domain = domain
    }

    /// Delete the cookie
    public static func clear() -> CookieValue {
        var c = CookieValue("")
        c.delete = true
        return c
    }
}

public enum Cookies {
    static let epoch = "Thu, 01 Jan 1970 00:00:00 GMT"

    private static func attr(_ what: String, _ v: String) throws -> String {
        if v.contains(";") || v.contains("\r") || v.contains("\n") { throw ComatypeError.internal("cookie の \(what) に使えない文字があります: \(v)") }
        return v
    }

    /// Builds a Set-Cookie value. Attributes (HttpOnly etc.) come from init.comat.
    public static func serialize(_ def: CookieDef?, _ v: CookieValue) throws -> String {
        guard let def = def else {
            throw ComatypeError.internal("このエンドポイントは cookie を発行できません（cookie off、または init.comat に cookie の宣言がありません）")
        }
        var parts = ["\(def.name)=\(Wire.percentEncode(v.delete ? "" : v.value))"]
        parts.append("Path=\(try attr("path", v.path ?? def.path ?? "/"))")
        if let d = v.domain ?? def.domain { parts.append("Domain=\(try attr("domain", d))") }
        if v.delete {
            parts.append("Max-Age=0")
            parts.append("Expires=\(epoch)")
        } else if let m = v.maxAge ?? def.maxAge {
            if m < 0 { throw ComatypeError.internal("cookie の maxAge が不正です: \(m)") }
            parts.append("Max-Age=\(m)")
        }
        if def.httpOnly { parts.append("HttpOnly") }
        if def.secure { parts.append("Secure") }
        if let s = def.sameSite { parts.append("SameSite=\(s.prefix(1).uppercased() + s.dropFirst())") }
        return parts.joined(separator: "; ")
    }
}

/// A jar for HTTP clients that do not keep cookies.
/// Assumes the API is a single origin: ignores Domain and looks only at Path and expiry.
public final class CookieJar {
    private struct Stored {
        var value: String
        var path = "/"
        var expires: Date?
    }

    private var m: [String: Stored] = [:]
    private let lock = NSLock()

    public init() {}

    /// Cookies to send to this path.
    public func get(_ path: String) -> [String: String] {
        lock.lock()
        defer { lock.unlock() }
        let now = Date()
        m = m.filter { $0.value.expires.map { $0 > now } ?? true }
        var out: [String: String] = [:]
        for (k, c) in m {
            let prefix = c.path.hasSuffix("/") ? c.path : c.path + "/"
            if c.path == "/" || path == c.path || path.hasPrefix(prefix) { out[k] = c.value }
        }
        return out
    }

    /// Takes in the response's Set-Cookie (Max-Age=0 deletes).
    public func store(_ lines: [String]) {
        lock.lock()
        defer { lock.unlock() }
        for line in lines {
            let segs = line.split(separator: ";", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
            guard let first = segs.first, let eq = first.firstIndex(of: "="), eq != first.startIndex else { continue }
            let name = String(first[..<eq])
            var c = Stored(value: Wire.percentDecode(String(first[first.index(after: eq)...])) ?? "")
            var maxAge: Int?
            for a in segs.dropFirst() {
                let kv = a.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
                let k = kv[0].lowercased()
                let v = kv.count > 1 ? String(kv[1]) : ""
                if k == "path", v.hasPrefix("/") { c.path = v }
                if k == "max-age" { maxAge = Int(v) }
            }
            if let ma = maxAge, ma <= 0 {
                m[name] = nil
                continue
            }
            if let ma = maxAge { c.expires = Date().addingTimeInterval(TimeInterval(ma)) }
            m[name] = c
        }
    }

    public func clear() {
        lock.lock()
        defer { lock.unlock() }
        m = [:]
    }
}

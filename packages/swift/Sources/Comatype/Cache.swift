import Foundation

/// `cache` in `.comat` (GET / QUERY endpoints only).
public struct CacheSpec {
    public enum Mode {
        /// Never cache
        case off
        /// In memory, for ttl
        case memory
        /// In a cookie, for ttl (client only)
        case cookie
    }

    public let mode: Mode
    public let ttlMs: Int

    public init(_ mode: Mode, ttlMs: Int = 0) {
        self.mode = mode
        self.ttlMs = ttlMs
    }

    public var memory: Bool { mode == .memory && ttlMs > 0 }
    public var cookie: Bool { mode == .cookie && ttlMs > 0 }
}

/// Cache (`cache` in `.comat`): an in-memory TTL cache and the encoding of keys and cookies.
public final class ResponseCache {
    /// Prefix of the names of cookies that hold a cache. The client does not send cookies with this name back to the server
    public static let cookiePrefix = "comatype_cache_"
    /// Maximum length of one cookie value. Larger responses are not cached in a cookie
    public static let cookieMax = 3800

    private let max: Int
    private let now: () -> Date
    private var map: [String: (res: RawResponse, expires: Date)] = [:]
    private var order: [String] = []
    private let lock = NSLock()

    public init(max: Int = 1000, now: @escaping () -> Date = Date.init) {
        self.max = max
        self.now = now
    }

    /// In-memory cache with ttl (expired entries are dropped on lookup; when the size limit is exceeded, the oldest are dropped)
    public func get(_ key: String) -> RawResponse? {
        lock.lock()
        defer { lock.unlock() }
        guard let e = map[key] else { return nil }
        if e.expires <= now() {
            map[key] = nil
            order.removeAll { $0 == key }
            return nil
        }
        return e.res
    }

    public func set(_ key: String, _ res: RawResponse, ttlMs: Int) {
        lock.lock()
        defer { lock.unlock() }
        if map[key] == nil { order.append(key) }
        map[key] = (res, now().addingTimeInterval(Double(ttlMs) / 1000))
        while map.count > max, !order.isEmpty { map[order.removeFirst()] = nil }
    }

    public func clear() {
        lock.lock()
        defer { lock.unlock() }
        map = [:]
        order = []
    }

    public var count: Int {
        lock.lock()
        defer { lock.unlock() }
        return map.count
    }

    /// Whether a response may be cached (2xx and no Set-Cookie)
    public static func cacheable(_ r: RawResponse) -> Bool { (200..<300).contains(r.status) && r.setCookies.isEmpty }

    /// Client cache key: method, URL (path and query) and body, plus the request headers declared in `.comat`.
    /// Headers added by wrappers or Config (Authorization etc.) are not included.
    public static func clientKey(_ method: String, _ url: String, _ body: Data, _ declared: [String], _ headers: Headers) -> String {
        let hs = declared.map { $0.lowercased() }.sorted().map { "\($0):\(headers.get($0) ?? "")" }.joined(separator: "\n")
        return "\(method)\n\(url)\n\(hs)\n\n\(String(decoding: body, as: UTF8.self))"
    }

    /// Server cache key: exact match of the request (method, path, query, all headers, body)
    public static func serverKey(_ method: String, _ target: String, _ headers: Headers, _ body: Data) -> String {
        let hs = headers.items.map { "\($0.name.lowercased()):\($0.value)" }.sorted().joined(separator: "\n")
        return "\(method)\n\(target)\n\(hs)\n\n\(String(decoding: body, as: UTF8.self))"
    }

    /// Builds a cookie name from a key (FNV-1a 64-bit)
    public static func cookieName(_ key: String) -> String {
        var h: UInt64 = 0xcbf2_9ce4_8422_2325
        for b in key.utf8 { h = (h ^ UInt64(b)) &* 0x100_0000_01b3 }
        let s = String(h, radix: 16)
        return cookiePrefix + String(repeating: "0", count: 16 - s.count) + s
    }

    /// Encodes a response as a cookie value (base64url of `status\nname\tvalue\n...\n\nbody`). nil if too large
    public static func encodeCookie(_ r: RawResponse) -> String? {
        var head = "\(r.status)\n"
        for h in r.headers.items { head += "\(h.name)\t\(h.value)\n" }
        head += "\n"
        var data = Data(head.utf8)
        data.append(r.body)
        let v = data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return v.count <= cookieMax ? v : nil
    }

    public static func decodeCookie(_ value: String) -> RawResponse? {
        var s = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while s.count % 4 != 0 { s += "=" }
        guard let data = Data(base64Encoded: s) else { return nil }
        let sep = Data("\n\n".utf8)
        guard let r = data.range(of: sep) else { return nil }
        let lines = String(decoding: data[..<r.lowerBound], as: UTF8.self).components(separatedBy: "\n")
        guard let status = Int(lines[0]) else { return nil }
        var out = RawResponse(status: status)
        out.body = Data(data[r.upperBound...])
        for l in lines.dropFirst() {
            if let tab = l.firstIndex(of: "\t") { out.headers.add(String(l[..<tab]), String(l[l.index(after: tab)...])) }
        }
        return out
    }
}

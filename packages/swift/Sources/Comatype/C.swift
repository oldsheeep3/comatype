import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Client. Call it like `try await C.get(Endpoint, arg)`.
///
/// The argument type Arg follows the request shape: Request if there are params / search / headers, Body if only a body, `NoArg` otherwise.
public enum C {
    /// Calls the next wrapper (the last one does the network call).
    public typealias Next = (RawRequest) async throws -> RawResponse

    /// A wrapper implementation. It can rewrite both the request and the response. One per `wrapper <name>` in init.comat.
    public typealias ComatypeWrap = (RawRequest, Next) async throws -> RawResponse

    /// Conformed to by the generated `Wrappers`.
    public protocol WrapperSet {
        func comatypeWrappers() -> [String: ComatypeWrap]
    }

    public struct Config {
        /// base url priority: here > env var COMATYPE_BASE_URL > baseUrl in init.comat
        public var baseURL: String?
        /// The generated `Wrappers`. An endpoint that uses a missing wrapper fails with an error
        public var wrappers: WrapperSet?
        /// If given, keeps Set-Cookie for `cookie on` endpoints and sends the cookies back
        public var cookieJar: CookieJar?
        public var session: URLSession = .shared
        /// Headers added to every request
        public var headers: [String: String] = [:]

        public init(baseURL: String? = nil, wrappers: WrapperSet? = nil, cookieJar: CookieJar? = nil, headers: [String: String] = [:]) {
            self.baseURL = baseURL
            self.wrappers = wrappers
            self.cookieJar = cookieJar
            self.headers = headers
        }
    }

    /// Responses of `cache <ttl>` (memory) endpoints
    private static let cache = ResponseCache()
    /// Cookie names of caches stored in cookies (for clearCache)
    private static var cacheCookies = Set<String>()

    /// Discards the caches (in memory and in the cookie jar), e.g. on logout.
    public static func clearCache() {
        cache.clear()
        lock.lock()
        defer { lock.unlock() }
        for name in cacheCookies { cfg.cookieJar?.store(["\(name)=; Path=/; Max-Age=0"]) }
        cacheCookies = []
    }

    private static func rememberCacheCookie(_ name: String) {
        lock.lock()
        defer { lock.unlock() }
        cacheCookies.insert(name)
    }

    private static let lock = NSLock()
    private static var cfg = Config()
    private static var wrappers: [String: ComatypeWrap] = [:]

    /// Call once at startup.
    public static func initialize(_ config: Config) {
        lock.lock()
        defer { lock.unlock() }
        cfg = config
        wrappers = config.wrappers?.comatypeWrappers() ?? [:]
    }

    private static func snapshot() -> (Config, [String: ComatypeWrap]) {
        lock.lock()
        defer { lock.unlock() }
        return (cfg, wrappers)
    }

    public static func get<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ arg: A) async throws -> R { try await call("get", ep, arg) }
    public static func post<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ arg: A) async throws -> R { try await call("post", ep, arg) }
    public static func put<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ arg: A) async throws -> R { try await call("put", ep, arg) }
    public static func patch<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ arg: A) async throws -> R { try await call("patch", ep, arg) }
    public static func delete<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ arg: A) async throws -> R { try await call("delete", ep, arg) }
    public static func options<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ arg: A) async throws -> R { try await call("options", ep, arg) }
    public static func query<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ arg: A) async throws -> R { try await call("query", ep, arg) }
    public static func head<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ arg: A) async throws -> R { try await call("head", ep, arg) }

    private static func call<A, Q, R>(_ method: String, _ ep: Endpoint<A, Q, R>, _ arg: A) async throws -> R {
        guard ep.method == method else { throw ComatypeError.config("C.\(method)() に \(ep.method) のエンドポイント（\(ep.module)）は渡せません") }
        guard let build = ep.buildRequest, let parse = ep.parseResponse else {
            throw ComatypeError.config("\(ep.module) はクライアント用に生成されていません（role: client で生成してください）")
        }
        let (conf, ws) = snapshot()

        var chain: [ComatypeWrap] = []
        for name in ep.wraps {
            guard let w = ws[name] else { throw ComatypeError.config("ラッパー \(name) が initialize に渡されていません（\(ep.module)）") }
            chain.append(w)
        }
        var raw = try build(arg)
        for (k, v) in conf.headers where !raw.headers.contains(k) { raw.headers.set(k, v) }
        if !raw.headers.contains("Accept") { raw.headers.set("Accept", "application/json") }
        if ep.cookie, let jar = conf.cookieJar {
            for (k, v) in jar.get(raw.path) where !k.hasPrefix(ResponseCache.cookiePrefix) { raw.cookies[k] = v } // Do not send cache cookies back
        }
        let resp = try await run(chain, 0, raw) { try await transport(ep, conf, $0) }
        return try parse(resp)
    }

    private static func run(_ chain: [ComatypeWrap], _ i: Int, _ req: RawRequest, _ send: @escaping Next) async throws -> RawResponse {
        if i == chain.count { return try await send(req) }
        return try await chain[i](req) { r in try await run(chain, i + 1, r, send) }
    }

    private static func transport<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ conf: Config, _ r: RawRequest) async throws -> RawResponse {
        var base = conf.baseURL
        if base == nil || base!.isEmpty { base = ProcessInfo.processInfo.environment["COMATYPE_BASE_URL"] }
        if base == nil || base!.isEmpty { base = ep.baseURL }
        guard var b = base, !b.isEmpty else {
            throw ComatypeError.config("base url がありません（Config.baseURL、環境変数 COMATYPE_BASE_URL、init.comat の baseUrl のどれかで指定してください）")
        }
        while b.hasSuffix("/") { b.removeLast() }
        var url = b + r.path
        if !r.query.isEmpty { url += "?" + r.query.map { "\(Wire.percentEncode($0.0))=\(Wire.percentEncode($0.1))" }.joined(separator: "&") }
        guard let u = URL(string: url) else { throw ComatypeError.config("URL が不正です: \(url)") }
        // Cache (GET / QUERY): memory or cookie. The key is method, URL, body and the declared request headers
        var cacheKey: String?
        if let spec = ep.cache, spec.memory || (spec.cookie && conf.cookieJar != nil) {
            let key = ResponseCache.clientKey(r.method, url, r.body, ep.cacheHeaders, r.headers)
            cacheKey = key
            let hit = spec.memory ? cache.get(key) : conf.cookieJar?.get("/")[ResponseCache.cookieName(key)].flatMap { ResponseCache.decodeCookie($0) }
            if let hit = hit { return hit }
        }
        var req = URLRequest(url: u)
        req.httpMethod = r.method.uppercased()
        for (k, v) in r.headers.items { req.addValue(v, forHTTPHeaderField: k) }
        if !r.cookies.isEmpty, !r.headers.contains("Cookie") {
            req.setValue(r.cookies.sorted { $0.key < $1.key }.map { "\($0.key)=\(Wire.percentEncode($0.value))" }.joined(separator: "; "), forHTTPHeaderField: "Cookie")
        }
        req.httpShouldHandleCookies = false
        if !r.body.isEmpty { req.httpBody = r.body }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await conf.session.data(for: req)
        } catch {
            throw ComatypeError.transport(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else { throw ComatypeError.transport("HTTP のレスポンスではありません") }
        var out = RawResponse(status: http.statusCode)
        out.body = data
        for (k, v) in http.allHeaderFields {
            guard let k = k as? String, let v = v as? String else { continue }
            if k.lowercased() == "set-cookie" { continue }
            out.headers.add(k, v)
        }
        out.setCookies = setCookies(http, u)
        if ep.cookie, let jar = conf.cookieJar, !out.setCookies.isEmpty { jar.store(out.setCookies) }
        if let key = cacheKey, let spec = ep.cache, ResponseCache.cacheable(out) {
            if spec.memory {
                cache.set(key, out, ttlMs: spec.ttlMs)
            } else if let jar = conf.cookieJar, let v = ResponseCache.encodeCookie(out) {
                let name = ResponseCache.cookieName(key)
                jar.store(["\(name)=\(v); Path=/; Max-Age=\(max(1, (spec.ttlMs + 999) / 1000))"]) // The cookie ttl is in seconds (rounded up)
                rememberCacheCookie(name)
            }
        }
        return out
    }

    /// Set-Cookie lines. URLSession joins multiple Set-Cookie values with ", ", so split them after removing the comma in `Expires=Wed, 21 Oct ...`
    public static func splitSetCookie(_ joined: String) -> [String] {
        var out: [String] = []
        var cur = ""
        let parts = joined.components(separatedBy: ",")
        for (i, p) in parts.enumerated() {
            let t = p.trimmingCharacters(in: .whitespaces)
            // A new cookie starts if the line begins with `name=` (the `Wed` in the attribute `Expires=Wed` is preceded by `Expires=`)
            let prevEndsWithExpires = cur.lowercased().hasSuffix("expires=") || cur.lowercased().range(of: "expires=[A-Za-z]{3}$", options: .regularExpression) != nil
            if i > 0, !prevEndsWithExpires, t.range(of: "^[^=;\\s]+=", options: .regularExpression) != nil {
                out.append(cur.trimmingCharacters(in: .whitespaces))
                cur = t
            } else {
                cur += (i == 0 ? "" : ",") + p
            }
        }
        if !cur.isEmpty { out.append(cur.trimmingCharacters(in: .whitespaces)) }
        return out
    }

    private static func setCookies(_ http: HTTPURLResponse, _ url: URL) -> [String] {
        guard let sc = http.allHeaderFields.first(where: { ($0.key as? String)?.lowercased() == "set-cookie" })?.value as? String else { return [] }
        return splitSetCookie(sc)
    }
}

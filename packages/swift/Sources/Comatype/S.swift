import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

/// Server. Register handlers on `S`, then run with `handle` (callable from any framework) or `serve` (a simple server on POSIX sockets).
public final class S {
    /// The request wrappers see. ctx holds the values this wrapper adds (the `wrapper` ctx in init.comat).
    public struct WrapRequest<Ctx> {
        public var raw: RawRequest
        public var ctx: Ctx?

        public init(raw: RawRequest, ctx: Ctx?) {
            self.raw = raw
            self.ctx = ctx
        }

        /// Adds ctx and makes the request to pass on.
        public func withCtx(_ ctx: Ctx) -> WrapRequest<Ctx> { WrapRequest(raw: raw, ctx: ctx) }
        public func cookie(_ name: String) -> String? { raw.cookie(name) }
        public func header(_ name: String) -> String? { raw.headers.get(name) }
    }

    /// Calls the next wrapper (the last one is the handler). The ctx passed to next becomes the ctx of the following wrappers and the handler.
    public typealias Next<Ctx> = (WrapRequest<Ctx>) async throws -> RawResponse
    /// A wrapper implementation (async). It can rewrite both the request and the response.
    public typealias ComatypeWrap<Ctx> = (WrapRequest<Ctx>, Next<Ctx>) async throws -> RawResponse
    /// The untyped form (made by `adapt`).
    public typealias ServerWrap = (RawRequest, (RawRequest) async throws -> RawResponse) async throws -> RawResponse

    /// Conformed to by the generated `Wrappers`.
    public protocol WrapperSet {
        func comatypeWrappers() -> [String: ServerWrap]
    }

    /// Turns a typed wrapper into the untyped form (used by the generated `Wrappers`).
    public static func adapt<Ctx>(_ name: String, _ w: @escaping ComatypeWrap<Ctx>) -> ServerWrap {
        { req, next in
            try await w(WrapRequest(raw: req, ctx: req.contexts[name] as? Ctx)) { r in
                var raw = r.raw
                if let c = r.ctx { raw.contexts[name] = c }
                return try await next(raw)
            }
        }
    }

    /// Return value for when a handler wants to add a cookie (`cookie on` endpoints).
    public struct Reply<R> {
        public var response: R
        public var cookie: CookieValue?

        public init(_ response: R, cookie: CookieValue? = nil) {
            self.response = response
            self.cookie = cookie
        }

        /// Issue the init.comat cookie
        public func withCookie(_ c: CookieValue) -> Reply<R> { Reply(response, cookie: c) }
        /// Delete the cookie
        public func clearCookie() -> Reply<R> { Reply(response, cookie: .clear()) }
    }

    /// Adds the cookies of a Reply to the RawResponse as Set-Cookie (used by generated code).
    public static func applyCookie(_ out: inout RawResponse, _ def: CookieDef?, _ cookie: CookieValue?) throws {
        if let c = cookie { out.setCookies.append(try Cookies.serialize(def, c)) }
    }

    /// Takes out the ctx added by wrapper name (500 if missing).
    public static func ctx<T>(_ raw: RawRequest, _ name: String, _ type: T.Type) throws -> T {
        guard let v = raw.contexts[name] as? T else { throw ComatypeError.internal("ラッパー \(name) が ctx を設定していません") }
        return v
    }

    private struct Route {
        let method: String
        let module: String
        let segs: [String]
        let statics: Int
        let wraps: [String]
        let cache: CacheSpec?
        let handle: (RawRequest) async -> RawResponse
    }

    private let lock = NSLock()
    /// Responses of `cache <ttl>` (memory) endpoints. Hit on an exact request match
    private let cache = ResponseCache()
    private var routes: [Route] = []
    private var wrappers: [String: ServerWrap] = [:]
    /// Receiver for handler errors and causes of responses that do not match .comat. Defaults to standard error
    public var onError: (String) -> Void = { FileHandle.standardError.write(Data("[comatype] \($0)\n".utf8)) }

    public init() {}

    /// Call once at startup. Requests to endpoints that use a missing wrapper get 500.
    public func initialize(wrappers w: WrapperSet) {
        lock.lock()
        defer { lock.unlock() }
        wrappers = w.comatypeWrappers()
    }

    public func get<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ h: @escaping (Q) async throws -> R) { register("get", ep, h) }
    public func post<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ h: @escaping (Q) async throws -> R) { register("post", ep, h) }
    public func put<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ h: @escaping (Q) async throws -> R) { register("put", ep, h) }
    public func patch<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ h: @escaping (Q) async throws -> R) { register("patch", ep, h) }
    public func delete<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ h: @escaping (Q) async throws -> R) { register("delete", ep, h) }
    public func options<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ h: @escaping (Q) async throws -> R) { register("options", ep, h) }
    public func query<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ h: @escaping (Q) async throws -> R) { register("query", ep, h) }
    public func head<A, Q, R>(_ ep: Endpoint<A, Q, R>, _ h: @escaping (Q) async throws -> R) { register("head", ep, h) }

    private static func segs(_ p: String) -> [String] { p.split(separator: "/").map(String.init) }

    private static func shape(_ method: String, _ segs: [String]) -> String {
        "\(method) /" + segs.map { $0.hasPrefix(":") ? ":" : $0 }.joined(separator: "/")
    }

    private func register<A, Q, R>(_ method: String, _ ep: Endpoint<A, Q, R>, _ h: @escaping (Q) async throws -> R) {
        precondition(ep.method == method, "S.\(method)() に \(ep.method) のエンドポイント（\(ep.module)）は渡せません")
        guard let parse = ep.parseRequest, let build = ep.buildResponse else {
            preconditionFailure("\(ep.module) はサーバ用に生成されていません（role: server で生成してください）")
        }
        let segs = S.segs(ep.path)
        let route = Route(method: method, module: ep.module, segs: segs, statics: segs.filter { !$0.hasPrefix(":") }.count, wraps: ep.wraps, cache: ep.cache) { raw in
            let req: Q
            do {
                req = try parse(raw)
            } catch let e as ValidationError {
                var items: [(key: String, value: JSON)] = [("code", .string("validation_error")), ("message", .string(e.description))]
                if !e.path.isEmpty { items.append(("path", .string(e.path))) }
                return RawResponse.json(400, .object(items))
            } catch {
                return RawResponse.error("\(error)")
            }
            do {
                return try build(try await h(req))
            } catch {
                return RawResponse.error("\(error)")
            }
        }
        lock.lock()
        defer { lock.unlock() }
        if let o = routes.first(where: { S.shape($0.method, $0.segs) == S.shape(method, segs) }) {
            preconditionFailure("\(S.shape(method, segs)) が重複しています（\(o.module) と \(ep.module)）")
        }
        routes.append(route)
    }

    private func snapshot() -> ([Route], [String: ServerWrap]) {
        lock.lock()
        defer { lock.unlock() }
        return (routes, wrappers)
    }

    private func find(_ routes: [Route], _ method: String, _ segs: [String]) -> (Route, [String: String])? {
        var best: (Route, [String: String])?
        for r in routes where r.method == method && r.segs.count == segs.count {
            var params: [String: String] = [:]
            var ok = true
            for (want, got) in zip(r.segs, segs) {
                if want.hasPrefix(":") { params[String(want.dropFirst())] = got } else if want != got { ok = false; break }
            }
            if ok, best == nil || r.statics > best!.0.statics { best = (r, params) }
        }
        return best
    }

    private static func jsonError(_ status: Int, _ code: String, _ message: String) -> RawResponse {
        RawResponse.json(status, .object([("code", .string(code)), ("message", .string(message))]))
    }

    /// Handles one request. target is `/path?query`. The entry point to call from a framework.
    public func handle(method: String, target: String, headers: Headers, body: Data) async -> RawResponse {
        let method = method.lowercased()
        let parts = target.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        let path = String(parts[0])
        let queryStr = parts.count > 1 ? String(parts[1]) : ""
        var segs: [String] = []
        for s in S.segs(path) {
            guard let d = Wire.percentDecode(s) else { return S.jsonError(400, "bad_request", "path が不正です") }
            segs.append(d)
        }
        let (rs, ws) = snapshot()
        guard let (route, params) = find(rs, method, segs) else {
            let allow = Set(rs.filter { find(rs, $0.method, segs) != nil }.map { $0.method.uppercased() }).sorted()
            if !allow.isEmpty {
                var r = S.jsonError(405, "method_not_allowed", "使えるメソッド: " + allow.joined(separator: ", "))
                r.headers.set("Allow", allow.joined(separator: ", "))
                return r
            }
            return S.jsonError(404, "not_found", path)
        }

        var raw = RawRequest(method: method, path: path)
        for p in queryStr.split(separator: "&") where !p.isEmpty {
            let kv = p.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            let k = Wire.percentDecode(String(kv[0]), form: true) ?? String(kv[0])
            let v = kv.count > 1 ? (Wire.percentDecode(String(kv[1]), form: true) ?? String(kv[1])) : ""
            raw.query.append((k, v))
        }
        raw.params = params
        raw.body = body
        for c in headers.getAll("Cookie") {
            for pair in c.split(separator: ";") {
                let kv = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
                guard kv.count == 2 else { continue }
                let k = kv[0].trimmingCharacters(in: .whitespaces)
                if raw.cookies[k] == nil { raw.cookies[k] = Wire.percentDecode(kv[1].trimmingCharacters(in: .whitespaces)) ?? String(kv[1]) }
            }
        }
        raw.headers = headers

        // Cache (GET / QUERY, memory only; cookie caching is client-only). Looked up before the wrappers, so the key includes all headers (auth too)
        var cacheKey: String?
        if let spec = route.cache, spec.memory {
            let key = ResponseCache.serverKey(method, target, headers, body)
            if let hit = cache.get(key) { return hit }
            cacheKey = key
        }

        var chain: [ServerWrap] = []
        for name in route.wraps {
            guard let w = ws[name] else {
                onError("ラッパー \(name) が initialize に渡されていません（\(route.module)）")
                return RawResponse.error("wrapper missing")
            }
            chain.append(w)
        }
        let resp: RawResponse
        do {
            resp = try await S.run(chain, 0, route.handle, raw)
        } catch {
            resp = RawResponse.error("\(route.module): \(error)")
        }
        if let e = resp.err {
            onError("\(route.module): \(e)")
        } else if let key = cacheKey, let spec = route.cache, ResponseCache.cacheable(resp) {
            cache.set(key, resp, ttlMs: spec.ttlMs)
        }
        return resp
    }

    private static func run(_ chain: [ServerWrap], _ i: Int, _ handle: @escaping (RawRequest) async -> RawResponse, _ req: RawRequest) async throws -> RawResponse {
        if i == chain.count { return await handle(req) }
        return try await chain[i](req) { r in try await run(chain, i + 1, handle, r) }
    }

    // ---- HTTP/1.1 server on POSIX sockets ----
    // Supports keep-alive, chunked bodies, read timeouts and a body size limit. No TLS (terminate it at a front proxy).

    private var listenFD: Int32 = -1
    /// Maximum request body size (bytes)
    public var maxBodySize = 16 * 1024 * 1024
    /// Read timeout of a connection (seconds)
    public var readTimeout = 30

    /// Starts the server (a thread per connection; handlers are async). With port 0, uses a free port. Returns the actual port.
    @discardableResult
    public func serve(host: String = "127.0.0.1", port: UInt16 = 0) throws -> UInt16 {
        #if canImport(Darwin)
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        #else
        let fd = socket(AF_INET, Int32(SOCK_STREAM.rawValue), 0)
        #endif
        guard fd >= 0 else { throw ComatypeError.transport("socket に失敗しました") }
        var yes: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr.s_addr = inet_addr(host)
        let bound = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        guard bound == 0, listen(fd, 128) == 0 else {
            close(fd)
            throw ComatypeError.transport("bind / listen に失敗しました")
        }
        var actual = sockaddr_in()
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        _ = withUnsafeMutablePointer(to: &actual) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &len) } }
        listenFD = fd
        Thread { [self] in
            while true {
                let c = accept(fd, nil, nil)
                if c < 0 {
                    if listenFD < 0 { return } // stop() was called
                    continue
                }
                var one: Int32 = 1
                setsockopt(c, SOL_SOCKET, SO_NOSIGPIPE_VALUE, &one, socklen_t(MemoryLayout<Int32>.size))
                var tv = timeval(tv_sec: readTimeout, tv_usec: 0)
                setsockopt(c, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
                Thread { self.connection(c) }.start()
            }
        }.start()
        return UInt16(bigEndian: actual.sin_port)
    }

    /// Stops the simple server (connections in progress continue until they finish).
    public func stop() {
        let fd = listenFD
        listenFD = -1
        if fd >= 0 { shutdown(fd, SHUT_RDWR); close(fd) }
    }

    private struct Reader {
        let fd: Int32
        var buf = [UInt8]()

        mutating func fill() -> Bool {
            var tmp = [UInt8](repeating: 0, count: 16384)
            let n = read(fd, &tmp, tmp.count)
            if n <= 0 { return false }
            buf.append(contentsOf: tmp[..<n])
            return true
        }

        mutating func line(limit: Int = 65536) -> String? {
            while true {
                if let i = buf.firstIndex(of: 0x0A) {
                    var l = Array(buf[..<i])
                    if l.last == 0x0D { l.removeLast() }
                    buf.removeSubrange(...i)
                    return String(decoding: l, as: UTF8.self)
                }
                if buf.count > limit || !fill() { return nil }
            }
        }

        mutating func bytes(_ n: Int) -> Data? {
            while buf.count < n { if !fill() { return nil } }
            let d = Data(buf.prefix(n))
            buf.removeFirst(n)
            return d
        }
    }

    private func write(_ fd: Int32, _ data: Data) -> Bool {
        data.withUnsafeBytes { p in
            var sent = 0
            while sent < data.count {
                let n = send(fd, p.baseAddress! + sent, data.count - sent, 0)
                if n <= 0 { return false }
                sent += n
            }
            return true
        }
    }

    private func respondSimple(_ fd: Int32, _ status: Int, _ message: String) {
        var r = S.jsonError(status, "bad_request", message)
        r.headers.set("Connection", "close")
        _ = write(fd, S.serialize(r, method: "GET", keepAlive: false))
    }

    private static func serialize(_ r: RawResponse, method: String, keepAlive: Bool) -> Data {
        let noBody = [204, 205, 304].contains(r.status) || method.uppercased() == "HEAD"
        var head = "HTTP/1.1 \(r.status) \(HTTPURLResponse.localizedString(forStatusCode: r.status).capitalized)\r\n"
        for h in r.headers.items where !["content-length", "connection"].contains(h.name.lowercased()) { head += "\(h.name): \(h.value)\r\n" }
        for c in r.setCookies { head += "Set-Cookie: \(c)\r\n" }
        head += "Content-Length: \(noBody ? 0 : r.body.count)\r\nConnection: \(keepAlive ? "keep-alive" : "close")\r\n\r\n"
        var out = Data(head.utf8)
        if !noBody { out.append(r.body) }
        return out
    }

    private func connection(_ fd: Int32) {
        defer { close(fd) }
        var rd = Reader(fd: fd)
        while true {
            guard let first = rd.line() else { return }
            if first.isEmpty { continue }
            let rl = first.split(separator: " ")
            guard rl.count >= 3 else { return respondSimple(fd, 400, "リクエストラインが不正です") }
            var headers = Headers()
            var count = 0
            while let l = rd.line(), !l.isEmpty {
                count += 1
                if count > 200 { return respondSimple(fd, 431, "ヘッダが多すぎます") }
                if let c = l.firstIndex(of: ":") {
                    headers.add(String(l[..<c]).trimmingCharacters(in: .whitespaces), String(l[l.index(after: c)...]).trimmingCharacters(in: .whitespaces))
                }
            }
            if (headers.get("Expect") ?? "").lowercased() == "100-continue" { _ = write(fd, Data("HTTP/1.1 100 Continue\r\n\r\n".utf8)) }
            var body = Data()
            if (headers.get("Transfer-Encoding") ?? "").lowercased().contains("chunked") {
                while true {
                    guard let sz = rd.line(), let n = Int(sz.split(separator: ";").first.map(String.init) ?? "", radix: 16) else { return respondSimple(fd, 400, "チャンクが不正です") }
                    if n == 0 {
                        while let t = rd.line(), !t.isEmpty {}
                        break
                    }
                    if body.count + n > maxBodySize { return respondSimple(fd, 413, "ボディが大きすぎます") }
                    guard let chunk = rd.bytes(n) else { return }
                    body.append(chunk)
                    _ = rd.line()
                }
            } else if let n = headers.get("Content-Length").flatMap({ Int($0) }), n > 0 {
                if n > maxBodySize { return respondSimple(fd, 413, "ボディが大きすぎます") }
                guard let b = rd.bytes(n) else { return }
                body = b
            }
            let method = String(rl[0])
            let keepAlive = rl[2] == "HTTP/1.1" && (headers.get("Connection") ?? "").lowercased() != "close"
            let sem = DispatchSemaphore(value: 0)
            var resp = RawResponse(status: 500)
            Task {
                resp = await self.handle(method: method, target: String(rl[1]), headers: headers, body: body)
                sem.signal()
            }
            sem.wait()
            if !write(fd, S.serialize(resp, method: method, keepAlive: keepAlive)) || !keepAlive { return }
        }
    }
}

#if canImport(Darwin)
private let SO_NOSIGPIPE_VALUE = SO_NOSIGPIPE
#else
private let SO_NOSIGPIPE_VALUE = SO_REUSEADDR // Linux needs MSG_NOSIGNAL on send; here we assume SIGPIPE is ignored at the process level
#endif

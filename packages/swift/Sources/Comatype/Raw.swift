import Foundation

/// Case-insensitive headers (the same name can appear several times).
public struct Headers {
    public private(set) var items: [(name: String, value: String)] = []

    public init() {}

    public func get(_ name: String) -> String? { items.first { $0.name.lowercased() == name.lowercased() }?.value }
    public func getAll(_ name: String) -> [String] { items.filter { $0.name.lowercased() == name.lowercased() }.map { $0.value } }
    public func contains(_ name: String) -> Bool { get(name) != nil }

    /// Replaces the same name
    public mutating func set(_ name: String, _ value: String) {
        items.removeAll { $0.name.lowercased() == name.lowercased() }
        items.append((name, value))
    }

    /// Adds, keeping the same name
    public mutating func add(_ name: String, _ value: String) { items.append((name, value)) }
}

/// Raw request seen by wrappers (the wire shape; no per-endpoint types).
public struct RawRequest {
    /// Lower case (get, post, ...)
    public var method: String
    /// The path after filling in the parameters (client), or the path that arrived (server)
    public var path: String
    public var headers = Headers()
    public var query: [(String, String)] = []
    public var params: [String: String] = [:]
    public var body = Data()
    public var cookies: [String: String] = [:]
    /// ctx added by server wrappers (wrapper name -> value)
    public var contexts: [String: Any] = [:]

    public init(method: String, path: String) {
        self.method = method
        self.path = path
    }

    /// Received cookie values
    public func cookie(_ name: String) -> String? { cookies[name] }
    public func queryAll(_ name: String) -> [String] { query.filter { $0.0 == name }.map { $0.1 } }
}

/// Raw response seen by wrappers (the wire shape).
public struct RawResponse {
    public var status: Int
    public var headers = Headers()
    public var body = Data()
    /// Set-Cookie lines to issue (server). On the client, the lines received
    public var setCookies: [String] = []
    /// The cause wrapped by `error` (not shown in the response)
    public var err: String?

    public init(status: Int) { self.status = status }

    /// Builds from a JSON tree (nil means no body).
    public static func json(_ status: Int, _ tree: JSON?) -> RawResponse {
        var r = RawResponse(status: status)
        if let t = tree {
            r.body = t.serialize()
            r.headers.set("Content-Type", "application/json")
        }
        return r
    }

    /// Turns the server's own error into a 500. The details are not shown to the client.
    public static func error(_ cause: String) -> RawResponse {
        var r = RawResponse(status: 500)
        r.body = Data(#"{"code":"internal_error","message":"Internal Server Error"}"#.utf8)
        r.headers.set("Content-Type", "application/json")
        r.err = cause
        return r
    }
}

/// Arg for endpoints with no request arguments.
public struct NoArg { public init() {} }

/// Endpoint descriptor (held by generated code).
/// Arg is what the client passes, Req is the request the server handler receives, Res is the response.
public struct Endpoint<Arg, Req, Res> {
    public let method: String
    public let path: String
    public let module: String
    public let baseURL: String?
    /// Outermost to innermost
    public let wraps: [String]
    public let cookie: Bool
    public let cookieDef: CookieDef?
    /// The `cache` setting (GET / QUERY only; nil means no caching) and the names of the declared request headers that go into the client cache key
    public let cache: CacheSpec?
    public let cacheHeaders: [String]
    // Client
    public let buildRequest: ((Arg) throws -> RawRequest)?
    public let parseResponse: ((RawResponse) throws -> Res)?
    // Server
    public let parseRequest: ((RawRequest) throws -> Req)?
    public let buildResponse: ((Res) throws -> RawResponse)?

    public init(method: String, path: String, module: String, baseURL: String?, wraps: [String], cookie: Bool, cookieDef: CookieDef?,
                cache: CacheSpec? = nil, cacheHeaders: [String] = [],
                buildRequest: ((Arg) throws -> RawRequest)? = nil, parseResponse: ((RawResponse) throws -> Res)? = nil,
                parseRequest: ((RawRequest) throws -> Req)? = nil, buildResponse: ((Res) throws -> RawResponse)? = nil) {
        self.method = method
        self.path = path
        self.module = module
        self.baseURL = baseURL
        self.wraps = wraps
        self.cookie = cookie
        self.cookieDef = cookieDef
        self.cache = cache
        self.cacheHeaders = cacheHeaders
        self.buildRequest = buildRequest
        self.parseResponse = parseResponse
        self.parseRequest = parseRequest
        self.buildResponse = buildResponse
    }
}

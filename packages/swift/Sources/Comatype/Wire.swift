import Foundation

/// Conversion between the wire shape (path, query, headers) and Swift values. Used by generated code.
public enum Wire {
    // ---- Values to strings ----

    public static func strs<T: WireString>(_ v: T) -> [String] { [v.wireString] }
    public static func strs<T: WireString>(_ v: T?) -> [String] { v.map { [$0.wireString] } ?? [] }
    public static func strs<T: WireString>(_ v: [T]) -> [String] { v.map { $0.wireString } }
    public static func strs<T: WireString>(_ v: [T]?) -> [String] { v?.map { $0.wireString } ?? [] }

    /// Turns a string-valued expression into a string to pass to `Check`
    public static func str<T: WireString>(_ v: T) -> String { v.wireString }

    // ---- From strings ----

    static func bad(_ m: String) -> ValidationError { ValidationError(path: "", reason: m) }

    public static func string(_ s: String) throws -> String { s }
    public static func bool(_ s: String) throws -> Bool {
        if s == "true" { return true }
        if s == "false" { return false }
        throw bad("真偽値は true か false にしてください")
    }
    public static func integer(_ s: String) throws -> Int {
        guard let n = Int(s.trimmingCharacters(in: .whitespaces)) else { throw bad("整数ではありません") }
        return n
    }
    public static func int64(_ s: String) throws -> Int64 {
        guard let n = Int64(s.trimmingCharacters(in: .whitespaces)) else { throw bad("整数ではありません") }
        return n
    }
    public static func email(_ s: String) throws -> Email { Email(s) }
    public static func phone(_ s: String) throws -> Phone { Phone(s) }
    public static func uuid(_ s: String) throws -> UUID { try Codec.parseUuid(s, "", 0) }
    public static func uuidv4(_ s: String) throws -> UUID { try Codec.parseUuid(s, "", 4) }
    public static func uuidv7(_ s: String) throws -> UUID { try Codec.parseUuid(s, "", 7) }
    public static func date(_ s: String) throws -> LocalDate { try Codec.parseDate(s, "") }
    public static func time(_ s: String) throws -> LocalTime { try Codec.parseTime(s, "") }
    public static func datetime(_ s: String) throws -> Date { try Codec.parseDatetime(s, "") }
    public static func decimal(_ s: String) throws -> Decimal { try Codec.parseDecimal(s, "") }
    public static func url(_ s: String) throws -> URL { try Codec.parseUrl(s, "") }

    private static func convert<T>(_ d: (String) throws -> T, _ s: String, _ name: String) throws -> T {
        do { return try d(s) } catch let e as ValidationError { throw ValidationError(path: name, reason: e.reason) }
    }

    /// Required value
    public static func read<T>(_ vals: [String], _ name: String, _ split: Bool, _ d: (String) throws -> T) throws -> T {
        guard let first = vals.first else { throw ValidationError(path: name, reason: "必須です") }
        return try convert(d, first, name)
    }

    /// Optional value (nil if missing)
    public static func readOpt<T>(_ vals: [String], _ name: String, _ split: Bool, _ d: (String) throws -> T) throws -> T? {
        guard let first = vals.first else { return nil }
        return try convert(d, first, name)
    }

    /// Array. For `split` (headers) it arrives as one ", "-separated value
    public static func readList<T>(_ vals: [String], _ name: String, _ split: Bool, _ d: (String) throws -> T) throws -> [T] {
        guard let items = try readListOpt(vals, name, split, d) else { throw ValidationError(path: name, reason: "必須です") }
        return items
    }

    public static func readListOpt<T>(_ vals: [String], _ name: String, _ split: Bool, _ d: (String) throws -> T) throws -> [T]? {
        if vals.isEmpty { return nil }
        var items = vals
        if split, vals.count == 1 {
            items =
                vals[0].trimmingCharacters(in: .whitespaces).isEmpty
                ? [] : vals[0].split(separator: ",", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
        }
        return try items.map { try convert(d, $0, name) }
    }

    // ---- Build the request (client). kv is (name, list of values) ----

    public static func percentEncode(_ s: String) -> String {
        var out = ""
        for b in s.utf8 {
            switch b {
            case UInt8(ascii: "A")...UInt8(ascii: "Z"), UInt8(ascii: "a")...UInt8(ascii: "z"), UInt8(ascii: "0")...UInt8(ascii: "9"),
                UInt8(ascii: "-"), UInt8(ascii: "."), UInt8(ascii: "_"), UInt8(ascii: "~"):
                out.append(Character(Unicode.Scalar(b)))
            default: out += String(format: "%%%02X", b)
            }
        }
        return out
    }

    /// `+` is kept as is (path / cookie). Only for `form` is `+` turned into a space
    public static func percentDecode(_ s: String, form: Bool = false) -> String? {
        var out = [UInt8]()
        let b = Array(s.utf8)
        var i = 0
        while i < b.count {
            if b[i] == UInt8(ascii: "%") {
                guard i + 3 <= b.count, let h = String(bytes: b[i + 1..<i + 3], encoding: .utf8), let v = UInt8(h, radix: 16) else {
                    return nil
                }
                out.append(v)
                i += 3
            } else if form, b[i] == UInt8(ascii: "+") {
                out.append(0x20)
                i += 1
            } else {
                out.append(b[i])
                i += 1
            }
        }
        return String(bytes: out, encoding: .utf8)
    }

    /// Fills in the `:name` parts of the path.
    public static func fillPath(_ raw: inout RawRequest, _ kv: [(String, [String])]) throws {
        var segs = raw.path.components(separatedBy: "/")
        for i in segs.indices where segs[i].hasPrefix(":") {
            let name = String(segs[i].dropFirst())
            guard let v = kv.first(where: { $0.0 == name })?.1.first, !v.isEmpty else { throw ValidationError(path: name, reason: "必須です") }
            raw.params[name] = v
            segs[i] = percentEncode(v)
        }
        raw.path = segs.joined(separator: "/")
    }

    public static func addQuery(_ raw: inout RawRequest, _ kv: [(String, [String])]) {
        for (k, vs) in kv { for v in vs { raw.query.append((k, v)) } }
    }

    /// Writes the headers. Arrays are joined with ", ". Empty ones are not written.
    public static func setHeaders(_ h: inout Headers, _ kv: [(String, [String])]) {
        for (k, vs) in kv where !vs.isEmpty { h.set(k, vs.joined(separator: ", ")) }
    }

    // ---- Take out the received values ----

    public static func paramValues(_ raw: RawRequest, _ name: String) -> [String] { raw.params[name].map { [$0] } ?? [] }
    public static func queryValues(_ raw: RawRequest, _ name: String) -> [String] { raw.queryAll(name) }
    public static func headerValues(_ h: Headers, _ name: String) -> [String] { h.getAll(name) }
}

import Foundation

public typealias JSONDecoderFn<T> = (JSON, String) throws -> T

/// Conversion between JSON trees and Swift values. Used by generated code.
public enum Codec {
    static func fail(_ path: String, _ reason: String) -> ValidationError { ValidationError(path: path, reason: reason) }

    // ---- Read ----

    public static func object(_ j: JSON, _ path: String) throws -> JSON {
        if case .object = j { return j }
        throw fail(path, "オブジェクトにしてください（\(j.kind) でした）")
    }

    public static func string(_ j: JSON, _ path: String) throws -> String {
        if case let .string(s) = j { return s }
        throw fail(path, "文字列にしてください（\(j.kind) でした）")
    }

    public static func bool(_ j: JSON, _ path: String) throws -> Bool {
        if case let .bool(b) = j { return b }
        throw fail(path, "真偽値にしてください（\(j.kind) でした）")
    }

    public static func integer(_ j: JSON, _ path: String) throws -> Int {
        if case let .int(n) = j { return Int(n) }
        if case let .double(d) = j, d == d.rounded(), abs(d) < 9e15 { return Int(d) }
        throw fail(path, "整数にしてください（\(j.kind) でした）")
    }

    /// A 64-bit integer sent as a string on the wire
    public static func int64(_ j: JSON, _ path: String) throws -> Int64 {
        guard let n = Int64(try string(j, path)) else { throw fail(path, "int64 は整数の文字列で送ってください") }
        return n
    }

    public static func email(_ j: JSON, _ path: String) throws -> Email {
        let e = Email(try string(j, path))
        try e.validate(path: path)
        return e
    }

    public static func phone(_ j: JSON, _ path: String) throws -> Phone {
        let p = Phone(try string(j, path))
        try p.validate(path: path)
        return p
    }

    public static func parseUuid(_ s: String, _ path: String, _ version: Int) throws -> UUID {
        let label = version == 0 ? "uuid" : "uuidv\(version)"
        guard
            s.range(of: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", options: .regularExpression)
                != nil,
            let u = UUID(uuidString: s)
        else { throw fail(path, "\(label) の形式が不正です") }
        if version != 0 { try Check.uuidVersion(path, u, version) }
        return u
    }

    public static func uuid(_ j: JSON, _ path: String) throws -> UUID { try parseUuid(try string(j, path), path, 0) }
    public static func uuidv4(_ j: JSON, _ path: String) throws -> UUID { try parseUuid(try string(j, path), path, 4) }
    public static func uuidv7(_ j: JSON, _ path: String) throws -> UUID { try parseUuid(try string(j, path), path, 7) }

    public static func parseDate(_ s: String, _ path: String) throws -> LocalDate {
        guard let d = LocalDate.parse(s) else { throw fail(path, "date は YYYY-MM-DD の形式にしてください") }
        return d
    }

    public static func date(_ j: JSON, _ path: String) throws -> LocalDate { try parseDate(try string(j, path), path) }

    public static func parseTime(_ s: String, _ path: String) throws -> LocalTime {
        guard let t = LocalTime.parse(s) else { throw fail(path, "time は HH:MM:SS の形式にしてください") }
        return t
    }

    public static func time(_ j: JSON, _ path: String) throws -> LocalTime { try parseTime(try string(j, path), path) }

    public static func parseDatetime(_ s: String, _ path: String) throws -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        throw fail(path, "datetime は RFC 3339 の形式にしてください")
    }

    public static func datetime(_ j: JSON, _ path: String) throws -> Date { try parseDatetime(try string(j, path), path) }

    public static func formatDatetime(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: d)
    }

    public static func parseDecimal(_ s: String, _ path: String) throws -> Decimal {
        guard s.range(of: "^-?\\d+(\\.\\d+)?$", options: .regularExpression) != nil,
            let d = Decimal(string: s, locale: Locale(identifier: "en_US_POSIX"))
        else { throw fail(path, "decimal は数値の文字列にしてください") }
        return d
    }

    public static func decimal(_ j: JSON, _ path: String) throws -> Decimal { try parseDecimal(try string(j, path), path) }

    public static func formatDecimal(_ d: Decimal) -> String {
        NSDecimalNumber(decimal: d).description(withLocale: Locale(identifier: "en_US_POSIX"))
    }

    public static func parseUrl(_ s: String, _ path: String) throws -> URL {
        guard let u = URL(string: s), u.scheme != nil, u.host != nil else { throw fail(path, "url は http(s)://host/... の形式にしてください") }
        return u
    }

    public static func url(_ j: JSON, _ path: String) throws -> URL { try parseUrl(try string(j, path), path) }

    public static func bytes(_ j: JSON, _ path: String) throws -> Data {
        guard let d = Data(base64Encoded: try string(j, path)) else { throw fail(path, "bytes は base64 の文字列にしてください") }
        return d
    }

    public static func json(_ j: JSON, _ path: String) throws -> JSON { j }

    public static func list<T>(_ j: JSON, _ path: String, _ d: JSONDecoderFn<T>) throws -> [T] {
        guard case let .array(items) = j else { throw fail(path, "配列にしてください（\(j.kind) でした）") }
        return try items.enumerated().map { try d($1, "\(path)[\($0)]") }
    }

    /// Allows null (`T | null`)
    public static func nullable<T>(_ d: @escaping JSONDecoderFn<T>) -> JSONDecoderFn<T?> {
        { j, p in
            if case .null = j { return nil }
            return try d(j, p)
        }
    }

    /// Required field ("required" error if missing)
    public static func req<T>(_ m: JSON, _ name: String, _ path: String, _ d: JSONDecoderFn<T>) throws -> T {
        let p = ValidationError.join(path, name)
        guard let v = m[name] else { throw fail(p, "必須です") }
        return try d(v, p)
    }

    /// Optional field (nil if missing or null)
    public static func opt<T>(_ m: JSON, _ name: String, _ path: String, _ d: JSONDecoderFn<T>) throws -> T? {
        guard let v = m[name] else { return nil }
        if case .null = v { return nil }
        return try d(v, ValidationError.join(path, name))
    }

    // ---- Body ----

    public static func encodeValue(_ tree: JSON) -> Data { tree.serialize() }

    /// Reads the body. Error paths start from `path`.
    public static func decode<T>(_ data: Data, _ path: String, _ d: JSONDecoderFn<T>) throws -> T {
        let j: JSON
        do { j = try JSON.parse(data) } catch let e as ValidationError { throw ValidationError(path: path, reason: e.reason) }
        return try d(j, path)
    }
}

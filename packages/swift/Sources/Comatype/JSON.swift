import Foundation

/// Dependency-free JSON.
public enum JSON: Equatable {
    case null
    case bool(Bool)
    case int(Int64)
    case double(Double)
    case string(String)
    case array([JSON])
    /// Keeps the order written
    case object([(key: String, value: JSON)])

    public static func == (a: JSON, b: JSON) -> Bool {
        switch (a, b) {
        case (.null, .null): return true
        case let (.bool(x), .bool(y)): return x == y
        case let (.int(x), .int(y)): return x == y
        case let (.double(x), .double(y)): return x == y
        case let (.string(x), .string(y)): return x == y
        case let (.array(x), .array(y)): return x == y
        case let (.object(x), .object(y)):
            return x.count == y.count && zip(x, y).allSatisfy { $0.key == $1.key && $0.value == $1.value }
        default: return false
        }
    }

    public subscript(key: String) -> JSON? {
        if case let .object(items) = self { return items.first { $0.key == key }?.value }
        return nil
    }

    public var kind: String {
        switch self {
        case .null: return "null"
        case .bool: return "真偽値"
        case .int, .double: return "数値"
        case .string: return "文字列"
        case .array: return "配列"
        case .object: return "オブジェクト"
        }
    }

    public static func parse(_ data: Data) throws -> JSON {
        var p = JSONParser(bytes: Array(data))
        p.skipWS()
        let v = try p.value()
        p.skipWS()
        if p.i != p.bytes.count { throw p.err("余分な文字があります") }
        return v
    }

    public func serialize() -> Data {
        var out = [UInt8]()
        write(into: &out)
        return Data(out)
    }

    private func write(into out: inout [UInt8]) {
        switch self {
        case .null: out.append(contentsOf: Array("null".utf8))
        case let .bool(b): out.append(contentsOf: Array((b ? "true" : "false").utf8))
        case let .int(n): out.append(contentsOf: Array(String(n).utf8))
        case let .double(d):
            if d == d.rounded(), abs(d) < 1e15 {
                out.append(contentsOf: Array(String(Int64(d)).utf8))
            } else {
                out.append(contentsOf: Array(String(d).utf8))
            }
        case let .string(s): JSON.quote(s, into: &out)
        case let .array(items):
            out.append(UInt8(ascii: "["))
            for (i, it) in items.enumerated() {
                if i > 0 { out.append(UInt8(ascii: ",")) }
                it.write(into: &out)
            }
            out.append(UInt8(ascii: "]"))
        case let .object(items):
            out.append(UInt8(ascii: "{"))
            for (i, kv) in items.enumerated() {
                if i > 0 { out.append(UInt8(ascii: ",")) }
                JSON.quote(kv.key, into: &out)
                out.append(UInt8(ascii: ":"))
                kv.value.write(into: &out)
            }
            out.append(UInt8(ascii: "}"))
        }
    }

    private static func quote(_ s: String, into out: inout [UInt8]) {
        out.append(UInt8(ascii: "\""))
        for u in s.unicodeScalars {
            switch u {
            case "\"": out.append(contentsOf: Array("\\\"".utf8))
            case "\\": out.append(contentsOf: Array("\\\\".utf8))
            case "\n": out.append(contentsOf: Array("\\n".utf8))
            case "\r": out.append(contentsOf: Array("\\r".utf8))
            case "\t": out.append(contentsOf: Array("\\t".utf8))
            default:
                if u.value < 0x20 {
                    out.append(contentsOf: Array(String(format: "\\u%04x", u.value).utf8))
                } else {
                    out.append(contentsOf: Array(String(Character(u)).utf8))
                }
            }
        }
        out.append(UInt8(ascii: "\""))
    }
}

struct JSONParser {
    let bytes: [UInt8]
    var i = 0

    init(bytes: [UInt8]) { self.bytes = bytes }

    func err(_ m: String) -> ValidationError {
        ValidationError(path: "", reason: "JSON として読めません: \(m)（位置 \(i)）")
    }

    mutating func skipWS() {
        while i < bytes.count, [0x20, 0x09, 0x0A, 0x0D].contains(bytes[i]) { i += 1 }
    }

    mutating func value() throws -> JSON {
        guard i < bytes.count else { throw err("途中で終わっています") }
        switch bytes[i] {
        case UInt8(ascii: "{"): return try object()
        case UInt8(ascii: "["): return try array()
        case UInt8(ascii: "\""): return .string(try string())
        case UInt8(ascii: "t"): return try lit("true", .bool(true))
        case UInt8(ascii: "f"): return try lit("false", .bool(false))
        case UInt8(ascii: "n"): return try lit("null", .null)
        default: return try number()
        }
    }

    mutating func lit(_ word: String, _ v: JSON) throws -> JSON {
        let w = Array(word.utf8)
        guard i + w.count <= bytes.count, Array(bytes[i ..< i + w.count]) == w else { throw err("不正な値") }
        i += w.count
        return v
    }

    mutating func object() throws -> JSON {
        var items = [(key: String, value: JSON)]()
        i += 1
        skipWS()
        if i < bytes.count, bytes[i] == UInt8(ascii: "}") { i += 1; return .object(items) }
        while true {
            skipWS()
            guard i < bytes.count, bytes[i] == UInt8(ascii: "\"") else { throw err("キーは文字列にしてください") }
            let k = try string()
            skipWS()
            guard i < bytes.count, bytes[i] == UInt8(ascii: ":") else { throw err("':' がありません") }
            i += 1
            skipWS()
            let v = try value()
            items.removeAll { $0.key == k }
            items.append((key: k, value: v))
            skipWS()
            guard i < bytes.count else { throw err("途中で終わっています") }
            let c = bytes[i]
            i += 1
            if c == UInt8(ascii: "}") { return .object(items) }
            if c != UInt8(ascii: ",") { throw err("',' か '}' が必要です") }
        }
    }

    mutating func array() throws -> JSON {
        var items = [JSON]()
        i += 1
        skipWS()
        if i < bytes.count, bytes[i] == UInt8(ascii: "]") { i += 1; return .array(items) }
        while true {
            skipWS()
            items.append(try value())
            skipWS()
            guard i < bytes.count else { throw err("途中で終わっています") }
            let c = bytes[i]
            i += 1
            if c == UInt8(ascii: "]") { return .array(items) }
            if c != UInt8(ascii: ",") { throw err("',' か ']' が必要です") }
        }
    }

    mutating func string() throws -> String {
        var out = [UInt8]()
        i += 1
        while true {
            guard i < bytes.count else { throw err("文字列が閉じていません") }
            let c = bytes[i]
            i += 1
            if c == UInt8(ascii: "\"") { break }
            if c < 0x20 { throw err("制御文字は使えません") }
            if c != UInt8(ascii: "\\") { out.append(c); continue }
            guard i < bytes.count else { throw err("途中で終わっています") }
            let e = bytes[i]
            i += 1
            switch e {
            case UInt8(ascii: "\""): out.append(e)
            case UInt8(ascii: "\\"): out.append(e)
            case UInt8(ascii: "/"): out.append(e)
            case UInt8(ascii: "b"): out.append(0x08)
            case UInt8(ascii: "f"): out.append(0x0C)
            case UInt8(ascii: "n"): out.append(0x0A)
            case UInt8(ascii: "r"): out.append(0x0D)
            case UInt8(ascii: "t"): out.append(0x09)
            case UInt8(ascii: "u"):
                var code = try hex4()
                if (0xD800 ..< 0xDC00).contains(code), i + 1 < bytes.count, bytes[i] == UInt8(ascii: "\\"), bytes[i + 1] == UInt8(ascii: "u") {
                    i += 2
                    let low = try hex4()
                    code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
                }
                guard let u = Unicode.Scalar(code) else { throw err("\\u が不正です") }
                out.append(contentsOf: Array(String(Character(u)).utf8))
            default: throw err("不正なエスケープ")
            }
        }
        guard let s = String(bytes: out, encoding: .utf8) else { throw err("UTF-8 として読めません") }
        return s
    }

    mutating func hex4() throws -> UInt32 {
        guard i + 4 <= bytes.count, let s = String(bytes: bytes[i ..< i + 4], encoding: .utf8), let v = UInt32(s, radix: 16) else { throw err("\\u が不正です") }
        i += 4
        return v
    }

    mutating func number() throws -> JSON {
        let st = i
        var frac = false
        if i < bytes.count, bytes[i] == UInt8(ascii: "-") { i += 1 }
        while i < bytes.count {
            let c = bytes[i]
            if (UInt8(ascii: "0") ... UInt8(ascii: "9")).contains(c) { i += 1 }
            else if [UInt8(ascii: "."), UInt8(ascii: "e"), UInt8(ascii: "E"), UInt8(ascii: "+"), UInt8(ascii: "-")].contains(c) { frac = true; i += 1 }
            else { break }
        }
        guard let t = String(bytes: bytes[st ..< i], encoding: .utf8), !t.isEmpty, t != "-" else { throw err("不正な値") }
        if !frac, let n = Int64(t) { return .int(n) }
        guard let d = Double(t) else { throw err("不正な数値 \(t)") }
        return .double(d)
    }
}

import Foundation

/// Validation and constraints (min / max / pattern / oneof).
public enum Check {
    /// String length range (`string(1..50)`)
    public static func len(_ path: String, _ s: String, _ min: Int64?, _ max: Int64?) throws {
        let n = Int64(s.unicodeScalars.count)
        if let m = min, n < m { throw ValidationError(path: path, reason: "文字数は \(m) 以上にしてください") }
        if let m = max, n > m { throw ValidationError(path: path, reason: "文字数は \(m) 以下にしてください") }
    }

    /// Value range (`int(0..150)`)
    public static func range(_ path: String, _ n: Double, _ min: Int64?, _ max: Int64?) throws {
        if let m = min, n < Double(m) { throw ValidationError(path: path, reason: "値は \(m) 以上にしてください") }
        if let m = max, n > Double(m) { throw ValidationError(path: path, reason: "値は \(m) 以下にしてください") }
    }

    public static func range(_ path: String, _ n: Decimal, _ min: Int64?, _ max: Int64?) throws {
        try range(path, NSDecimalNumber(decimal: n).doubleValue, min, max)
    }

    public static func pattern(_ path: String, _ s: String, _ pattern: String) throws {
        guard let re = try? NSRegularExpression(pattern: pattern) else {
            throw ValidationError(path: path, reason: "pattern \"\(pattern)\" が不正です")
        }
        if re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) == nil {
            throw ValidationError(path: path, reason: "パターン \(pattern) に一致しません")
        }
    }

    public static func oneOf(_ path: String, _ s: String, _ values: [String]) throws {
        if !values.contains(s) { throw ValidationError(path: path, reason: "\(values.joined(separator: " | ")) のどれかにしてください") }
    }

    public static func uuidVersion(_ path: String, _ u: UUID, _ version: Int) throws {
        let s = u.uuidString
        let chars = Array(s)
        // 8-4-4-4-12: the version is the 15th character, the variant the 20th
        guard chars.count == 36, String(chars[14]) == String(version), "89ABab".contains(chars[19]) else {
            throw ValidationError(path: path, reason: "uuidv\(version) の形式が不正です")
        }
    }
}

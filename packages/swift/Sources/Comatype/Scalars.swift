import Foundation

/// Conformed to by generated object types.
public protocol JsonType {
    /// Checks that the value matches the .comat type (including constraints)
    func validate(path: String) throws
    /// Turns into a JSON tree (assumes it has been validated)
    func encode() -> JSON
}

private func matches(_ pattern: String, _ s: String) -> Bool {
    s.range(of: pattern, options: .regularExpression) != nil
}

/// Email address. A string on the wire.
public struct Email: Hashable, CustomStringConvertible {
    public let value: String
    public init(_ value: String) { self.value = value }
    public var description: String { value }
    public func validate(path: String) throws {
        if !matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", value) { throw ValidationError(path: path, reason: "email の形式が不正です") }
    }
}

/// E.164 phone number. A string on the wire.
public struct Phone: Hashable, CustomStringConvertible {
    public let value: String
    public init(_ value: String) { self.value = value }
    public var description: String { value }
    public func validate(path: String) throws {
        if !matches("^\\+[1-9]\\d{1,14}$", value) { throw ValidationError(path: path, reason: "phone は E.164 の形式にしてください") }
    }
}

/// `YYYY-MM-DD`
public struct LocalDate: Hashable, CustomStringConvertible {
    public let year: Int
    public let month: Int
    public let day: Int

    public init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    public var description: String { String(format: "%04d-%02d-%02d", year, month, day) }

    public static func parse(_ s: String) -> LocalDate? {
        guard matches("^\\d{4}-\\d{2}-\\d{2}$", s) else { return nil }
        let p = s.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        let (y, m, d) = (p[0], p[1], p[2])
        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
        let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        guard (1...12).contains(m), d >= 1, d <= days[m - 1] else { return nil }
        return LocalDate(year: y, month: m, day: d)
    }
}

/// `HH:MM:SS`
public struct LocalTime: Hashable, CustomStringConvertible {
    public let hour: Int
    public let minute: Int
    public let second: Int

    public init(hour: Int, minute: Int, second: Int) {
        self.hour = hour
        self.minute = minute
        self.second = second
    }

    public var description: String { String(format: "%02d:%02d:%02d", hour, minute, second) }

    public static func parse(_ s: String) -> LocalTime? {
        guard matches("^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$", s) else { return nil }
        let p = s.split(separator: ":").compactMap { Int($0) }
        return p.count == 3 ? LocalTime(hour: p[0], minute: p[1], second: p[2]) : nil
    }
}

/// String used when placing in path, query and headers.
public protocol WireString {
    var wireString: String { get }
}

extension String: WireString { public var wireString: String { self } }
extension Bool: WireString { public var wireString: String { self ? "true" : "false" } }
extension Int: WireString { public var wireString: String { String(self) } }
extension Int64: WireString { public var wireString: String { String(self) } }
extension Email: WireString { public var wireString: String { value } }
extension Phone: WireString { public var wireString: String { value } }
extension UUID: WireString { public var wireString: String { uuidString.lowercased() } }
extension LocalDate: WireString { public var wireString: String { description } }
extension LocalTime: WireString { public var wireString: String { description } }
extension URL: WireString { public var wireString: String { absoluteString } }
extension Date: WireString { public var wireString: String { Codec.formatDatetime(self) } }
extension Decimal: WireString { public var wireString: String { Codec.formatDecimal(self) } }
extension RawRepresentable where RawValue == String { public var wireString: String { rawValue } }

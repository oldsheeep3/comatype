using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Comatype;

/// <summary>Conversion between JSON trees and C# values. Used by generated code.</summary>
public static class Codec
{
    public delegate T Decoder<out T>(object? json, string path);

    private static ValidationException Fail(string path, string reason) => new(path, reason);

    private static string Describe(object? j) =>
        j switch
        {
            null => "null",
            string => "文字列",
            bool => "真偽値",
            long or double or int => "数値",
            IList => "配列",
            _ => "オブジェクト",
        };

    // ---- Reading ----

    public static Dictionary<string, object?> ReadObject(object? j, string path) =>
        j as Dictionary<string, object?> ?? throw Fail(path, "オブジェクトにしてください（" + Describe(j) + " でした）");

    public static List<object?> ReadArray(object? j, string path) =>
        j as List<object?> ?? throw Fail(path, "配列にしてください（" + Describe(j) + " でした）");

    public static string ReadString(object? j, string path) =>
        j as string ?? throw Fail(path, "文字列にしてください（" + Describe(j) + " でした）");

    public static bool ReadBool(object? j, string path) => j is bool b ? b : throw Fail(path, "真偽値にしてください（" + Describe(j) + " でした）");

    public static long ReadInteger(object? j, string path)
    {
        if (j is long l) return l;
        if (j is double d && d == Math.Round(d) && Math.Abs(d) < 9e15) return (long)d;
        throw Fail(path, "整数にしてください（" + Describe(j) + " でした）");
    }

    /// <summary>A 64-bit integer, a string on the wire.</summary>
    public static long ReadInt64(object? j, string path)
    {
        if (long.TryParse(ReadString(j, path), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var v)) return v;
        throw Fail(path, "int64 は整数の文字列で送ってください");
    }

    public static Email ReadEmail(object? j, string path)
    {
        var e = new Email(ReadString(j, path));
        e.Validate(path);
        return e;
    }

    public static Phone ReadPhone(object? j, string path)
    {
        var p = new Phone(ReadString(j, path));
        p.Validate(path);
        return p;
    }

    public static Guid ReadUuid(object? j, string path) => ParseUuid(ReadString(j, path), path, 0);

    public static Guid ReadUuidV4(object? j, string path) => ParseUuid(ReadString(j, path), path, 4);

    public static Guid ReadUuidV7(object? j, string path) => ParseUuid(ReadString(j, path), path, 7);

    private static readonly Regex UuidRe = new("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", RegexOptions.Compiled);

    public static Guid ParseUuid(string s, string path, int version)
    {
        var label = version == 0 ? "uuid" : "uuidv" + version;
        if (!UuidRe.IsMatch(s)) throw Fail(path, label + " の形式が不正です");
        var u = Guid.Parse(s);
        if (version != 0) Check.UuidVersion(path, u, version);
        return u;
    }

    public static DateOnly ReadDate(object? j, string path) => ParseDate(ReadString(j, path), path);

    private static readonly Regex DateRe = new(@"^\d{4}-\d{2}-\d{2}$", RegexOptions.Compiled);

    public static DateOnly ParseDate(string s, string path)
    {
        if (DateRe.IsMatch(s) && DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) return d;
        throw Fail(path, "date は YYYY-MM-DD の形式にしてください");
    }

    public static TimeOnly ReadTime(object? j, string path) => ParseTime(ReadString(j, path), path);

    private static readonly Regex TimeRe = new(@"^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$", RegexOptions.Compiled);

    public static TimeOnly ParseTime(string s, string path)
    {
        if (!TimeRe.IsMatch(s)) throw Fail(path, "time は HH:MM:SS の形式にしてください");
        return TimeOnly.ParseExact(s, "HH:mm:ss", CultureInfo.InvariantCulture);
    }

    public static DateTimeOffset ReadDatetime(object? j, string path) => ParseDatetime(ReadString(j, path), path);

    private static readonly Regex DatetimeRe = new(@"^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$", RegexOptions.Compiled);

    public static DateTimeOffset ParseDatetime(string s, string path)
    {
        if (DatetimeRe.IsMatch(s) && DateTimeOffset.TryParse(s.ToUpperInvariant(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            return d.ToUniversalTime();
        throw Fail(path, "datetime は RFC 3339 の形式にしてください");
    }

    public static decimal ReadDecimal(object? j, string path) => ParseDecimal(ReadString(j, path), path);

    private static readonly Regex DecimalRe = new(@"^-?\d+(\.\d+)?$", RegexOptions.Compiled);

    public static decimal ParseDecimal(string s, string path)
    {
        if (DecimalRe.IsMatch(s) && decimal.TryParse(s, NumberStyles.Number, CultureInfo.InvariantCulture, out var d)) return d;
        throw Fail(path, "decimal は数値の文字列にしてください");
    }

    public static Uri ReadUrl(object? j, string path) => ParseUrl(ReadString(j, path), path);

    public static Uri ParseUrl(string s, string path)
    {
        if (Uri.TryCreate(s, UriKind.Absolute, out var u) && u.Host.Length > 0) return u;
        throw Fail(path, "url は http(s)://host/... の形式にしてください");
    }

    public static byte[] ReadBytes(object? j, string path)
    {
        try
        {
            return Convert.FromBase64String(ReadString(j, path));
        }
        catch (FormatException)
        {
            throw Fail(path, "bytes は base64 の文字列にしてください");
        }
    }

    public static object? ReadJson(object? j, string path) => j;

    public static T ReadEnum<T>(object? j, string path)
        where T : struct, Enum
    {
        var s = ReadString(j, path);
        if (WireNames.TryParse<T>(s, out var v)) return v;
        throw Fail(path, string.Join(" | ", WireNames.Names<T>()) + " のどれかにしてください");
    }

    public static List<T> ReadList<T>(object? j, string path, Decoder<T> d)
    {
        var src = ReadArray(j, path);
        var @out = new List<T>(src.Count);
        for (var i = 0; i < src.Count; i++) @out.Add(d(src[i], path + "[" + i + "]"));
        return @out;
    }

    /// <summary>Allows null (`T | null`), value types.</summary>
    public static Decoder<T?> NullableV<T>(Decoder<T> d)
        where T : struct =>
        (j, p) =>
        {
            if (j == null) return null;
            return d(j, p);
        };

    /// <summary>Allows null (`T | null`), reference types.</summary>
    public static Decoder<T?> NullableR<T>(Decoder<T> d)
        where T : class =>
        (j, p) =>
        {
            if (j == null) return null;
            return d(j, p);
        };

    /// <summary>A required field (when missing: "required").</summary>
    public static T Req<T>(Dictionary<string, object?> m, string name, string path, Decoder<T> d)
    {
        var p = ValidationException.Join(path, name);
        if (!m.TryGetValue(name, out var v)) throw Fail(p, "必須です");
        return d(v, p);
    }

    /// <summary>An optional field, value types (null if absent or null).</summary>
    public static T? OptV<T>(Dictionary<string, object?> m, string name, string path, Decoder<T> d)
        where T : struct
    {
        if (!m.TryGetValue(name, out var v) || v == null) return null;
        return d(v, ValidationException.Join(path, name));
    }

    /// <summary>An optional field, reference types (null if absent or null).</summary>
    public static T? OptR<T>(Dictionary<string, object?> m, string name, string path, Decoder<T> d)
        where T : class
    {
        if (!m.TryGetValue(name, out var v) || v == null) return null;
        return d(v, ValidationException.Join(path, name));
    }

    // ---- Writing ----

    public static string FromInt64(long v) => v.ToString(CultureInfo.InvariantCulture);

    public static string FromDecimal(decimal v) => v.ToString(CultureInfo.InvariantCulture);

    public static string FromTime(TimeOnly v) => v.ToString("HH:mm:ss", CultureInfo.InvariantCulture);

    public static string FromDate(DateOnly v) => v.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>RFC 3339 in UTC (fractional seconds only when present).</summary>
    public static string FromDatetime(DateTimeOffset v)
    {
        var u = v.UtcDateTime;
        var s = u.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);
        var frac = u.Ticks % TimeSpan.TicksPerSecond;
        if (frac != 0) s += "." + frac.ToString("0000000", CultureInfo.InvariantCulture).TrimEnd('0');
        return s + "Z";
    }

    public static string FromUrl(Uri v) => v.OriginalString;

    public static string FromBytes(byte[] v) => Convert.ToBase64String(v);

    public static List<object?> FromList<T>(List<T> v, Func<T, object?> f)
    {
        var @out = new List<object?>(v.Count);
        foreach (var t in v) @out.Add(t == null ? null : f(t));
        return @out;
    }

    // ---- Body ----

    /// <summary>Validates, then converts to JSON bytes.</summary>
    public static byte[] Encode(IJsonType v)
    {
        v.Validate("");
        return Json.Bytes(v.Encode());
    }

    public static byte[] EncodeValue(object? tree) => Json.Bytes(tree);

    public static T Decode<T>(byte[] data, Decoder<T> d) => d(Json.Parse(data), "");

    /// <summary>Reads a body. Error paths start from `path`.</summary>
    public static T Decode<T>(byte[] data, string path, Decoder<T> d)
    {
        object? json;
        try
        {
            json = Json.Parse(data);
        }
        catch (ValidationException e)
        {
            throw new ValidationException(path, e.Reason);
        }
        return d(json, path);
    }
}

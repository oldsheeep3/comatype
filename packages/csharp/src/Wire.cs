using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;

namespace Comatype;

/// <summary>Conversion between the wire form (path, query, headers) and C# values. Used by generated code.</summary>
public static class Wire
{
    public delegate T Parser<out T>(string s);

    /// <summary>Converts a value to a string.</summary>
    public static string Str(object? v) =>
        v switch
        {
            null => "null",
            string s => s,
            bool b => b ? "true" : "false",
            long l => l.ToString(CultureInfo.InvariantCulture),
            int i => i.ToString(CultureInfo.InvariantCulture),
            double d => d.ToString("R", CultureInfo.InvariantCulture),
            Email e => e.Value,
            Phone p => p.Value,
            decimal m => Codec.FromDecimal(m),
            Guid g => g.ToString("D"),
            DateOnly d => Codec.FromDate(d),
            TimeOnly t => Codec.FromTime(t),
            DateTimeOffset dt => Codec.FromDatetime(dt),
            Uri u => Codec.FromUrl(u),
            Enum e => WireNames.Of(e),
            _ => v.ToString() ?? "",
        };

    /// <summary>Converts to a list of strings (null becomes empty).</summary>
    public static List<string> Strs(object? v)
    {
        var @out = new List<string>();
        if (v == null) return @out;
        if (v is IEnumerable l and not string)
        {
            foreach (var o in l) @out.Add(Str(o));
            return @out;
        }
        @out.Add(Str(v));
        return @out;
    }

    // ---- From strings ----

    public static string ParseString(string s) => s;

    public static bool ParseBool(string s)
    {
        if (s == "true") return true;
        if (s == "false") return false;
        throw new ArgumentException("真偽値は true か false にしてください");
    }

    public static long ParseInteger(string s)
    {
        if (long.TryParse(s.Trim(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var v)) return v;
        throw new ArgumentException("整数ではありません");
    }

    public static Email ParseEmail(string s) => new(s);

    public static Phone ParsePhone(string s) => new(s);

    public static Guid ParseUuid(string s) => Codec.ParseUuid(s, "", 0);

    public static Guid ParseUuidV4(string s) => Codec.ParseUuid(s, "", 4);

    public static Guid ParseUuidV7(string s) => Codec.ParseUuid(s, "", 7);

    public static DateOnly ParseDate(string s) => Codec.ParseDate(s, "");

    public static TimeOnly ParseTime(string s) => Codec.ParseTime(s, "");

    public static DateTimeOffset ParseDatetime(string s) => Codec.ParseDatetime(s, "");

    public static decimal ParseDecimal(string s) => Codec.ParseDecimal(s, "");

    public static Uri ParseUrl(string s) => Codec.ParseUrl(s, "");

    public static T ParseEnum<T>(string s)
        where T : struct, Enum
    {
        if (WireNames.TryParse<T>(s, out var v)) return v;
        throw new ArgumentException(string.Join(" | ", WireNames.Names<T>()) + " のどれかにしてください");
    }

    private static T Convert<T>(Parser<T> d, string s, string name)
    {
        try
        {
            return d(s);
        }
        catch (ValidationException e)
        {
            throw new ValidationException(name, e.Reason);
        }
        catch (ArgumentException e)
        {
            throw new ValidationException(name, e.Message);
        }
    }

    /// <summary>A required value.</summary>
    public static T Read<T>(List<string> vals, string name, bool split, Parser<T> d)
    {
        if (vals.Count == 0) throw new ValidationException(name, "必須です");
        return Convert(d, vals[0], name);
    }

    /// <summary>An optional value, value types (null if absent).</summary>
    public static T? ReadOptV<T>(List<string> vals, string name, bool split, Parser<T> d)
        where T : struct => vals.Count == 0 ? null : Convert(d, vals[0], name);

    /// <summary>An optional value, reference types (null if absent).</summary>
    public static T? ReadOptR<T>(List<string> vals, string name, bool split, Parser<T> d)
        where T : class => vals.Count == 0 ? null : Convert(d, vals[0], name);

    private static List<T> ReadItems<T>(List<string> vals, string name, bool split, Parser<T> d)
    {
        var items = vals;
        if (split && vals.Count == 1)
        {
            items = new List<string>();
            if (vals[0].Trim().Length != 0)
                foreach (var p in vals[0].Split(',')) items.Add(p.Trim());
        }
        var @out = new List<T>();
        foreach (var it in items) @out.Add(Convert(d, it, name));
        return @out;
    }

    /// <summary>A required array. For `split` (headers) it arrives as one ", "-separated value.</summary>
    public static List<T> ReadList<T>(List<string> vals, string name, bool split, Parser<T> d)
    {
        if (vals.Count == 0) throw new ValidationException(name, "必須です");
        return ReadItems(vals, name, split, d);
    }

    /// <summary>An optional array (null if absent).</summary>
    public static List<T>? ReadListOpt<T>(List<string> vals, string name, bool split, Parser<T> d) =>
        vals.Count == 0 ? null : ReadItems(vals, name, split, d);

    // ---- Building requests (client). kv is name, value, name, value, ... ----

    /// <summary>Fills in `:name` in the path.</summary>
    public static void FillPath(RawRequest raw, params object?[] kv)
    {
        var segs = raw.Path.Split('/');
        for (var i = 0; i < segs.Length; i++)
        {
            if (!segs[i].StartsWith(':')) continue;
            var name = segs[i].Substring(1);
            string? v = null;
            for (var k = 0; k + 1 < kv.Length; k += 2)
            {
                if ((string?)kv[k] == name)
                {
                    var vs = Strs(kv[k + 1]);
                    if (vs.Count > 0) v = vs[0];
                }
            }
            if (string.IsNullOrEmpty(v)) throw new ValidationException(name, "必須です");
            raw.Params[name] = v;
            segs[i] = Cookies.Encode(v);
        }
        raw.Path = string.Join("/", segs);
    }

    public static void AddQuery(RawRequest raw, params object?[] kv)
    {
        for (var k = 0; k + 1 < kv.Length; k += 2)
            foreach (var v in Strs(kv[k + 1])) raw.Query.Add(((string)kv[k]!, v));
    }

    /// <summary>Writes a header. Arrays are joined with ", ". null is not written.</summary>
    public static void SetHeaders(Headers h, params object?[] kv)
    {
        for (var k = 0; k + 1 < kv.Length; k += 2)
        {
            var vs = Strs(kv[k + 1]);
            if (vs.Count > 0) h.Set((string)kv[k]!, string.Join(", ", vs));
        }
    }

    // ---- Reading received values ----

    public static List<string> ParamValues(RawRequest raw, string name) =>
        raw.Params.TryGetValue(name, out var v) ? new List<string> { v } : new List<string>();

    public static List<string> QueryValues(RawRequest raw, string name) => raw.QueryAll(name);

    public static List<string> HeaderValues(Headers h, string name) => h.GetAll(name);
}

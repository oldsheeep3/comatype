using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Comatype;

/// <summary>A cookie to issue (server).</summary>
public sealed record CookieValue(string Value, bool Delete, long? MaxAge = null, string? Path = null, string? Domain = null)
{
    public static CookieValue Of(string value) => new(value, false);

    /// <summary>Deletes the cookie.</summary>
    public static CookieValue Clear() => new("", true);

    public CookieValue WithMaxAge(long seconds) => this with { MaxAge = seconds };

    public CookieValue WithPath(string path) => this with { Path = path };

    public CookieValue WithDomain(string domain) => this with { Domain = domain };
}

/// <summary>Builds Set-Cookie lines for cookies (server), and percent-encoding shared with the client.</summary>
public static class Cookies
{
    internal const string Epoch = "Thu, 01 Jan 1970 00:00:00 GMT";

    public static string Encode(string s) => Uri.EscapeDataString(s);

    public static string Decode(string s) => Uri.UnescapeDataString(s);

    private static string Attr(string what, string v)
    {
        if (v.Contains(';') || v.Contains('\r') || v.Contains('\n')) throw new ComatypeException("cookie の " + what + " に使えない文字があります: " + v);
        return v;
    }

    /// <summary>Builds a Set-Cookie value. Attributes (HttpOnly etc.) come from init.comat.</summary>
    public static string Serialize(CookieDef? def, CookieValue v)
    {
        if (def == null)
            throw new ComatypeException("このエンドポイントは cookie を発行できません（cookie off、または init.comat に cookie の宣言がありません）");
        var parts = new List<string> { def.Name + "=" + Encode(v.Delete ? "" : v.Value) };
        var path = v.Path ?? def.Path ?? "/";
        parts.Add("Path=" + Attr("path", path));
        var domain = v.Domain ?? def.Domain;
        if (domain != null) parts.Add("Domain=" + Attr("domain", domain));
        if (v.Delete)
        {
            parts.Add("Max-Age=0");
            parts.Add("Expires=" + Epoch);
        }
        else
        {
            var maxAge = v.MaxAge ?? def.MaxAge;
            if (maxAge != null)
            {
                if (maxAge < 0) throw new ComatypeException("cookie の maxAge が不正です: " + maxAge);
                parts.Add("Max-Age=" + maxAge.Value.ToString(CultureInfo.InvariantCulture));
            }
        }
        if (def.HttpOnly) parts.Add("HttpOnly");
        if (def.Secure) parts.Add("Secure");
        if (def.SameSite != null) parts.Add("SameSite=" + char.ToUpperInvariant(def.SameSite[0]) + def.SameSite.Substring(1));
        return string.Join("; ", parts);
    }
}

/// <summary>
/// A jar for HTTP clients that keep no cookies. Assumes the API is a single origin: ignores Domain and looks only at Path and expiry.
/// </summary>
public sealed class CookieJar
{
    private sealed class Stored
    {
        public string Value = "";
        public string Path = "/";
        public long ExpiresAt; // 0 means a session cookie (milliseconds)
    }

    private readonly SortedDictionary<string, Stored> _m = new(StringComparer.Ordinal);
    private readonly object _lock = new();

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>Cookies to send for this path.</summary>
    public SortedDictionary<string, string> Get(string path)
    {
        lock (_lock)
        {
            var now = Now();
            var @out = new SortedDictionary<string, string>(StringComparer.Ordinal);
            foreach (var k in _m.Where(e => e.Value.ExpiresAt != 0 && e.Value.ExpiresAt <= now).Select(e => e.Key).ToList()) _m.Remove(k);
            foreach (var (name, c) in _m)
            {
                var prefix = c.Path.EndsWith('/') ? c.Path : c.Path + "/";
                if (c.Path == "/" || path == c.Path || path.StartsWith(prefix, StringComparison.Ordinal)) @out[name] = c.Value;
            }
            return @out;
        }
    }

    /// <summary>Takes in Set-Cookie from a response (Max-Age=0 deletes).</summary>
    public void Store(IEnumerable<string> lines)
    {
        lock (_lock)
        {
            foreach (var line in lines)
            {
                var segs = line.Split(';');
                var eq = segs[0].IndexOf('=');
                if (eq <= 0) continue;
                var name = segs[0].Substring(0, eq).Trim();
                var c = new Stored { Value = Cookies.Decode(segs[0].Substring(eq + 1).Trim()) };
                long? maxAge = null;
                for (var i = 1; i < segs.Length; i++)
                {
                    var a = segs[i].Trim();
                    var e2 = a.IndexOf('=');
                    var k = (e2 < 0 ? a : a.Substring(0, e2)).ToLowerInvariant();
                    var v = e2 < 0 ? "" : a.Substring(e2 + 1);
                    if (k == "path" && v.StartsWith('/')) c.Path = v;
                    else if (k == "max-age" && long.TryParse(v, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var n)) maxAge = n;
                }
                if (maxAge != null && maxAge <= 0)
                {
                    _m.Remove(name);
                    continue;
                }
                if (maxAge != null) c.ExpiresAt = Now() + maxAge.Value * 1000;
                _m[name] = c;
            }
        }
    }

    public void Clear()
    {
        lock (_lock) _m.Clear();
    }
}

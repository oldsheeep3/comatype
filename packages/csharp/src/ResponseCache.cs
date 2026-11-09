using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Comatype;

/// <summary>Caching (<c>cache</c> in <c>.comat</c>): an in-memory TTL cache, plus key and cookie encoding.</summary>
public sealed class ResponseCache
{
    /// <summary>Prefix of cache cookie names. The client does not send cookies with this prefix back to the server.</summary>
    public const string CookiePrefix = "comatype_cache_";

    /// <summary>Maximum length of one cookie value. Larger responses are not cached in cookies.</summary>
    public const int CookieMax = 3800;

    private sealed record Entry(RawResponse Res, long Expires);

    private readonly int _max;
    private readonly Func<long> _nowMs;
    private readonly Dictionary<string, Entry> _map = new();
    private readonly LinkedList<string> _order = new();
    private readonly object _lock = new();

    public ResponseCache(int max)
        : this(max, () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) { }

    public ResponseCache(int max, Func<long> nowMs)
    {
        _max = max;
        _nowMs = nowMs;
    }

    /// <summary>
    /// In-memory cache with a ttl (expired entries are dropped on lookup; above the size limit, the oldest are dropped first).
    /// </summary>
    public RawResponse? Get(string key)
    {
        lock (_lock)
        {
            if (!_map.TryGetValue(key, out var e)) return null;
            if (e.Expires <= _nowMs())
            {
                Remove(key);
                return null;
            }
            return Copy(e.Res);
        }
    }

    public void Set(string key, RawResponse res, long ttlMs)
    {
        lock (_lock)
        {
            Remove(key);
            _map[key] = new Entry(Copy(res), _nowMs() + ttlMs);
            _order.AddLast(key);
            while (_map.Count > _max)
            {
                var oldest = _order.First!.Value;
                Remove(oldest);
            }
        }
    }

    private void Remove(string key)
    {
        if (_map.Remove(key)) _order.Remove(key);
    }

    public void Clear()
    {
        lock (_lock)
        {
            _map.Clear();
            _order.Clear();
        }
    }

    public int Size
    {
        get
        {
            lock (_lock) return _map.Count;
        }
    }

    internal static RawResponse Copy(RawResponse r)
    {
        var o = new RawResponse(r.Status);
        foreach (var (n, v) in r.Headers.Entries) o.Headers.Add(n, v);
        o.Body = (byte[])r.Body.Clone();
        return o;
    }

    /// <summary>Whether a response may be cached (2xx, without Set-Cookie).</summary>
    public static bool Cacheable(RawResponse r) => r.Status >= 200 && r.Status < 300 && r.SetCookies.Count == 0;

    /// <summary>
    /// The client cache key: method, URL (path and query) and body, plus the request headers declared in <c>.comat</c>. Headers added
    /// by wrappers or Config (e.g. Authorization) are not included.
    /// </summary>
    public static string ClientKey(string method, string url, byte[] body, IReadOnlyList<string> declared, Headers headers)
    {
        var names = declared.Select(n => n.ToLowerInvariant()).OrderBy(n => n, StringComparer.Ordinal).ToList();
        var b = new StringBuilder(method).Append('\n').Append(url).Append('\n');
        foreach (var n in names) b.Append(n).Append(':').Append(headers.Get(n) ?? "").Append('\n');
        return b.Append('\n').Append(Encoding.UTF8.GetString(body)).ToString();
    }

    /// <summary>The server cache key: an exact match of the request (method, path, query, all headers, body).</summary>
    public static string ServerKey(string method, string target, Headers headers, byte[] body)
    {
        var sorted = new SortedDictionary<string, string>(StringComparer.Ordinal);
        foreach (var (n, v) in headers.Entries)
        {
            var k = n.ToLowerInvariant();
            sorted[k] = sorted.TryGetValue(k, out var prev) ? prev + ", " + v : v;
        }
        var b = new StringBuilder(method).Append('\n').Append(target).Append('\n');
        foreach (var (k, v) in sorted) b.Append(k).Append(':').Append(v).Append('\n');
        return b.Append('\n').Append(Encoding.UTF8.GetString(body)).ToString();
    }

    /// <summary>Builds a cookie name from a key (FNV-1a, 64 bit).</summary>
    public static string CookieName(string key)
    {
        var h = 0xcbf29ce484222325UL;
        unchecked
        {
            foreach (var x in Encoding.UTF8.GetBytes(key)) h = (h ^ x) * 0x100000001b3UL;
        }
        return CookiePrefix + h.ToString("x16", CultureInfo.InvariantCulture);
    }

    /// <summary>Encodes a response as a cookie value (base64url of <c>status\nname\tvalue\n...\n\nbody</c>). Null if too large.</summary>
    public static string? EncodeCookie(RawResponse r)
    {
        var head = new StringBuilder().Append(r.Status).Append('\n');
        foreach (var (n, v) in r.Headers.Entries) head.Append(n).Append('\t').Append(v).Append('\n');
        head.Append('\n');
        var h = Encoding.UTF8.GetBytes(head.ToString());
        var all = new byte[h.Length + r.Body.Length];
        Buffer.BlockCopy(h, 0, all, 0, h.Length);
        Buffer.BlockCopy(r.Body, 0, all, h.Length, r.Body.Length);
        var v64 = Convert.ToBase64String(all).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return v64.Length <= CookieMax ? v64 : null;
    }

    public static RawResponse? DecodeCookie(string value)
    {
        try
        {
            var s = value.Replace('-', '+').Replace('_', '/');
            s = s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
            var raw = Convert.FromBase64String(s);
            var pos = -1;
            for (var i = 0; i + 1 < raw.Length; i++)
            {
                if (raw[i] == '\n' && raw[i + 1] == '\n')
                {
                    pos = i;
                    break;
                }
            }
            if (pos < 0) return null;
            var lines = Encoding.UTF8.GetString(raw, 0, pos).Split('\n');
            var @out = new RawResponse(int.Parse(lines[0], CultureInfo.InvariantCulture));
            for (var i = 1; i < lines.Length; i++)
            {
                var tab = lines[i].IndexOf('\t');
                if (tab > 0) @out.Headers.Add(lines[i].Substring(0, tab), lines[i].Substring(tab + 1));
            }
            @out.Body = raw[(pos + 2)..];
            return @out;
        }
        catch (FormatException)
        {
            return null;
        }
    }
}

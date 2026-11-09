using System;
using System.Collections.Generic;

namespace Comatype;

/// <summary>Case-insensitive headers (the same name can appear multiple times).</summary>
public sealed class Headers
{
    private readonly List<(string Name, string Value)> _items = new();

    public string? Get(string name)
    {
        foreach (var (n, v) in _items)
            if (string.Equals(n, name, StringComparison.OrdinalIgnoreCase))
                return v;
        return null;
    }

    public List<string> GetAll(string name)
    {
        var @out = new List<string>();
        foreach (var (n, v) in _items)
            if (string.Equals(n, name, StringComparison.OrdinalIgnoreCase))
                @out.Add(v);
        return @out;
    }

    /// <summary>Replaces entries with the same name.</summary>
    public Headers Set(string name, string value)
    {
        _items.RemoveAll(kv => string.Equals(kv.Name, name, StringComparison.OrdinalIgnoreCase));
        _items.Add((name, value));
        return this;
    }

    /// <summary>Adds, keeping entries with the same name.</summary>
    public Headers Add(string name, string value)
    {
        _items.Add((name, value));
        return this;
    }

    public bool Contains(string name) => Get(name) != null;

    public List<(string Name, string Value)> Entries => _items;
}

/// <summary>The raw request (wire form, with no per-endpoint types) as seen by wrappers.</summary>
public sealed class RawRequest
{
    /// <summary>Lowercase (get, post, ...).</summary>
    public string Method { get; set; }

    /// <summary>The path after filling in params (client), or the received path (server).</summary>
    public string Path { get; set; }

    public Headers Headers { get; set; } = new();
    public List<(string Name, string Value)> Query { get; set; } = new();
    public Dictionary<string, string> Params { get; set; } = new();
    public byte[] Body { get; set; } = Array.Empty<byte>();
    public SortedDictionary<string, string> Cookies { get; set; } = new(StringComparer.Ordinal);

    /// <summary>ctx added by server wrappers (wrapper name to value).</summary>
    public Dictionary<string, object> Contexts { get; set; } = new();

    public RawRequest(string method, string path)
    {
        Method = method;
        Path = path;
    }

    /// <summary>The value of a received cookie (null if absent).</summary>
    public string? Cookie(string name) => Cookies.TryGetValue(name, out var v) ? v : null;

    public List<string> QueryAll(string name)
    {
        var @out = new List<string>();
        foreach (var (n, v) in Query)
            if (n == name)
                @out.Add(v);
        return @out;
    }

    public RawRequest Copy()
    {
        var r = new RawRequest(Method, Path);
        foreach (var (n, v) in Headers.Entries) r.Headers.Add(n, v);
        r.Query = new List<(string Name, string Value)>(Query);
        r.Params = new Dictionary<string, string>(Params);
        r.Body = Body;
        r.Cookies = new SortedDictionary<string, string>(Cookies, StringComparer.Ordinal);
        r.Contexts = new Dictionary<string, object>(Contexts);
        return r;
    }
}

/// <summary>The raw response (wire form) as seen by wrappers.</summary>
public sealed class RawResponse
{
    public int Status { get; set; }
    public Headers Headers { get; set; } = new();
    public byte[] Body { get; set; } = Array.Empty<byte>();

    /// <summary>Set-Cookie lines to issue (server). On the client, the received lines.</summary>
    public List<string> SetCookies { get; set; } = new();

    /// <summary>The cause wrapped by <see cref="Error"/> (not included in the response).</summary>
    public string? Err { get; set; }

    public RawResponse(int status)
    {
        Status = status;
    }

    /// <summary>Creates a RawResponse whose body is the given JSON tree (null means no body).</summary>
    public static RawResponse Json(int status, object? tree)
    {
        var r = new RawResponse(status);
        if (tree != null)
        {
            r.Body = Comatype.Json.Bytes(tree);
            r.Headers.Set("Content-Type", "application/json");
        }
        return r;
    }

    /// <summary>Converts a generated object type to JSON (used by wrappers).</summary>
    public static RawResponse Json(int status, IJsonType? body)
    {
        if (body == null) return new RawResponse(status);
        body.Validate("");
        return Json(status, body.Encode());
    }

    /// <summary>Turns a server-side fault into a 500. The details are not shown to the client.</summary>
    public static RawResponse Error(string cause)
    {
        var r = new RawResponse(500)
        {
            Body = System.Text.Encoding.UTF8.GetBytes("{\"code\":\"internal_error\",\"message\":\"Internal Server Error\"}"),
            Err = cause,
        };
        r.Headers.Set("Content-Type", "application/json");
        return r;
    }
}

using System;
using System.Collections.Generic;

namespace Comatype;

/// <summary>
/// <c>cache</c> in <c>.comat</c> (GET / QUERY endpoints only). Mode is "off" (never cache) / "memory" (in memory for the ttl)
/// / "cookie" (in a cookie for the ttl; client only).
/// </summary>
public sealed record CacheSpec(string Mode, long TtlMs)
{
    public bool Memory => Mode == "memory" && TtlMs > 0;

    public bool Cookie => Mode == "cookie" && TtlMs > 0;
}

/// <summary><c>cookie &lt;name&gt; { ... }</c> in init.comat.</summary>
public sealed record CookieDef(string Name, bool HttpOnly, bool Secure, string? SameSite, string? Path, string? Domain, long? MaxAge);

/// <summary>
/// Endpoint descriptor (held by generated code). TArg is the argument the client passes, TReq is the request the server handler
/// receives, TRes is the response.
/// </summary>
public sealed class Endpoint<TArg, TReq, TRes>
{
    public string Method { get; }
    public string Path { get; }
    public string Module { get; }
    public string? BaseUrl { get; }

    /// <summary>From outermost to innermost.</summary>
    public IReadOnlyList<string> Wraps { get; }

    public bool Cookie { get; }
    public CookieDef? CookieDef { get; }

    /// <summary>The <c>cache</c> setting (GET / QUERY only; null means no caching).</summary>
    public CacheSpec? CacheSpec { get; private set; }

    /// <summary>Names of the declared request headers included in the client cache key.</summary>
    public IReadOnlyList<string> CacheHeaders { get; private set; } = Array.Empty<string>();

    // Client
    public Func<TArg, RawRequest>? BuildRequest { get; }
    public Func<RawResponse, TRes>? ParseResponse { get; }

    // Server
    public Func<RawRequest, TReq>? ParseRequest { get; }
    public Func<TRes, RawResponse>? BuildResponse { get; }

    internal Endpoint(
        string method,
        string path,
        string module,
        string? baseUrl,
        IReadOnlyList<string> wraps,
        bool cookie,
        CookieDef? cookieDef,
        Func<TArg, RawRequest>? buildRequest,
        Func<RawResponse, TRes>? parseResponse,
        Func<RawRequest, TReq>? parseRequest,
        Func<TRes, RawResponse>? buildResponse
    )
    {
        Method = method;
        Path = path;
        Module = module;
        BaseUrl = baseUrl;
        Wraps = wraps;
        Cookie = cookie;
        CookieDef = cookieDef;
        BuildRequest = buildRequest;
        ParseResponse = parseResponse;
        ParseRequest = parseRequest;
        BuildResponse = buildResponse;
    }

    /// <summary>Adds the <c>cache</c> setting (used by generated code).</summary>
    public Endpoint<TArg, TReq, TRes> Cache(CacheSpec spec, IReadOnlyList<string> headers)
    {
        CacheSpec = spec;
        CacheHeaders = headers;
        return this;
    }
}

/// <summary>Builds <see cref="Endpoint{TArg, TReq, TRes}"/> (used by generated code).</summary>
public static class Endpoint
{
    public static Endpoint<TArg, NoArg, TRes> Client<TArg, TRes>(
        string method,
        string path,
        string module,
        string? baseUrl,
        IReadOnlyList<string> wraps,
        bool cookie,
        CookieDef? cookieDef,
        Func<TArg, RawRequest> buildRequest,
        Func<RawResponse, TRes> parseResponse
    ) => new(method, path, module, baseUrl, wraps, cookie, cookieDef, buildRequest, parseResponse, null, null);

    public static Endpoint<NoArg, TReq, TRes> Server<TReq, TRes>(
        string method,
        string path,
        string module,
        string? baseUrl,
        IReadOnlyList<string> wraps,
        bool cookie,
        CookieDef? cookieDef,
        Func<RawRequest, TReq> parseRequest,
        Func<TRes, RawResponse> buildResponse
    ) => new(method, path, module, baseUrl, wraps, cookie, cookieDef, null, null, parseRequest, buildResponse);
}

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Comatype;

/// <summary>
/// The client. Call it like <c>await C.GetAsync(Endpoint, arg)</c>.
/// <para>
/// The Arg type depends on the request shape: Request if there are params / search / headers, Body if only a body, <see cref="NoArg"/> if none.
/// </para>
/// </summary>
public static class C
{
    /// <summary>Calls the next wrapper (the last one performs the request).</summary>
    public delegate Task<RawResponse> Next(RawRequest req);

    /// <summary>A wrapper implementation. It can rewrite both the request and the response. One per <c>wrapper &lt;name&gt;</c> in init.comat.</summary>
    public delegate Task<RawResponse> ComatypeWrap(RawRequest req, Next next);

    /// <summary>Implemented by the generated Wrappers.</summary>
    public interface IWrapperSet
    {
        IReadOnlyDictionary<string, ComatypeWrap> ComatypeWrappers();
    }

    public sealed class Config
    {
        /// <summary>Base url precedence: this &gt; env var COMATYPE_BASE_URL &gt; baseUrl in init.comat.</summary>
        public string? BaseUrl { get; set; }

        /// <summary>The generated Wrappers. An endpoint that uses a missing wrapper is an error.</summary>
        public IWrapperSet? Wrappers { get; set; }

        /// <summary>If given, Set-Cookie is kept and sent back for <c>cookie on</c> endpoints.</summary>
        public CookieJar? CookieJar { get; set; }

        public HttpClient? HttpClient { get; set; }

        /// <summary>Headers added to every request.</summary>
        public Dictionary<string, string> Headers { get; } = new();

        public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(30);

        public Config WithBaseUrl(string v)
        {
            BaseUrl = v;
            return this;
        }

        public Config WithWrappers(IWrapperSet v)
        {
            Wrappers = v;
            return this;
        }

        public Config WithCookieJar(CookieJar v)
        {
            CookieJar = v;
            return this;
        }
    }

    /// <summary>Responses of <c>cache &lt;ttl&gt;</c> (memory) endpoints.</summary>
    private static readonly ResponseCache Cache = new(1000);

    /// <summary>Cookie names of caches stored in cookies (for ClearCache).</summary>
    private static readonly ConcurrentDictionary<string, bool> CacheCookies = new();

    private static volatile Config _cfg = new();
    private static volatile IReadOnlyDictionary<string, ComatypeWrap> _wrappers = new Dictionary<string, ComatypeWrap>();

    private static readonly HttpClient DefaultClient = new(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false })
    {
        Timeout = System.Threading.Timeout.InfiniteTimeSpan,
    };

    /// <summary>Discards the caches (memory and those in the cookie jar), e.g. on logout.</summary>
    public static void ClearCache()
    {
        Cache.Clear();
        var jar = _cfg.CookieJar;
        foreach (var name in CacheCookies.Keys) jar?.Store(new[] { name + "=; Path=/; Max-Age=0" });
        CacheCookies.Clear();
    }

    /// <summary>Call once at startup.</summary>
    public static void Init(Config c)
    {
        _cfg = c;
        _wrappers = c.Wrappers?.ComatypeWrappers() ?? new Dictionary<string, ComatypeWrap>();
    }

    public static Task<R> GetAsync<A, Q, R>(Endpoint<A, Q, R> ep, A arg) => CallAsync("get", ep, arg);

    public static Task<R> PostAsync<A, Q, R>(Endpoint<A, Q, R> ep, A arg) => CallAsync("post", ep, arg);

    public static Task<R> PutAsync<A, Q, R>(Endpoint<A, Q, R> ep, A arg) => CallAsync("put", ep, arg);

    public static Task<R> PatchAsync<A, Q, R>(Endpoint<A, Q, R> ep, A arg) => CallAsync("patch", ep, arg);

    public static Task<R> DeleteAsync<A, Q, R>(Endpoint<A, Q, R> ep, A arg) => CallAsync("delete", ep, arg);

    public static Task<R> OptionsAsync<A, Q, R>(Endpoint<A, Q, R> ep, A arg) => CallAsync("options", ep, arg);

    public static Task<R> QueryAsync<A, Q, R>(Endpoint<A, Q, R> ep, A arg) => CallAsync("query", ep, arg);

    public static Task<R> HeadAsync<A, Q, R>(Endpoint<A, Q, R> ep, A arg) => CallAsync("head", ep, arg);

    private static async Task<R> CallAsync<A, Q, R>(string method, Endpoint<A, Q, R> ep, A arg)
    {
        if (ep.Method != method)
            throw new ComatypeException.Config("C." + method + "() に " + ep.Method + " のエンドポイント（" + ep.Module + "）は渡せません");
        if (ep.BuildRequest == null || ep.ParseResponse == null)
            throw new ComatypeException.Config(ep.Module + " はクライアント用に生成されていません（role: client で生成してください）");
        var conf = _cfg;
        var ws = _wrappers;
        var chain = new List<ComatypeWrap>();
        foreach (var name in ep.Wraps)
        {
            if (!ws.TryGetValue(name, out var w)) throw new ComatypeException.Config("ラッパー " + name + " が init に渡されていません（" + ep.Module + "）");
            chain.Add(w);
        }
        var raw = ep.BuildRequest(arg);
        foreach (var (k, v) in conf.Headers)
            if (!raw.Headers.Contains(k))
                raw.Headers.Set(k, v);
        if (!raw.Headers.Contains("Accept")) raw.Headers.Set("Accept", "application/json");
        if (ep.Cookie && conf.CookieJar != null)
        {
            // Cache cookies are not sent back to the server
            foreach (var (k, v) in conf.CookieJar.Get(raw.Path))
                if (!k.StartsWith(ResponseCache.CookiePrefix, StringComparison.Ordinal))
                    raw.Cookies[k] = v;
        }

        Next next = r => TransportAsync(ep.BaseUrl, ep.Cookie, ep.CacheSpec, ep.CacheHeaders, conf, r);
        for (var i = chain.Count - 1; i >= 0; i--)
        {
            var w = chain[i];
            var inner = next;
            next = r => w(r, inner);
        }
        var resp = await next(raw).ConfigureAwait(false);
        if (resp == null) throw new ComatypeException.Config("ラッパーが null のレスポンスを返しました（" + ep.Module + "）");
        return ep.ParseResponse(resp);
    }

    private static async Task<RawResponse> TransportAsync(
        string? epBaseUrl,
        bool epCookie,
        CacheSpec? spec,
        IReadOnlyList<string> cacheHeaders,
        Config conf,
        RawRequest r
    )
    {
        var baseUrl = conf.BaseUrl;
        if (string.IsNullOrEmpty(baseUrl)) baseUrl = Environment.GetEnvironmentVariable("COMATYPE_BASE_URL");
        if (string.IsNullOrEmpty(baseUrl)) baseUrl = epBaseUrl;
        if (string.IsNullOrEmpty(baseUrl))
            throw new ComatypeException.Config("base url がありません（Config.BaseUrl、環境変数 COMATYPE_BASE_URL、init.comat の baseUrl のどれかで指定してください）");
        var url = new StringBuilder(baseUrl.TrimEnd('/')).Append(r.Path);
        if (r.Query.Count > 0)
        {
            url.Append('?');
            for (var i = 0; i < r.Query.Count; i++)
            {
                if (i > 0) url.Append('&');
                url.Append(Cookies.Encode(r.Query[i].Name)).Append('=').Append(Cookies.Encode(r.Query[i].Value));
            }
        }
        // Cache (GET / QUERY): memory or cookie. The key is the method, URL, body and the declared request headers
        string? cacheKey = null;
        if (spec != null && (spec.Memory || (spec.Cookie && conf.CookieJar != null)))
        {
            cacheKey = ResponseCache.ClientKey(r.Method, url.ToString(), r.Body, cacheHeaders, r.Headers);
            RawResponse? hit = null;
            if (spec.Memory)
            {
                hit = Cache.Get(cacheKey);
            }
            else if (conf.CookieJar!.Get("/").TryGetValue(ResponseCache.CookieName(cacheKey), out var cv))
            {
                hit = ResponseCache.DecodeCookie(cv);
            }
            if (hit != null) return hit;
        }
        using var msg = new HttpRequestMessage(new HttpMethod(r.Method.ToUpperInvariant()), url.ToString());
        ByteArrayContent? content = r.Body.Length == 0 ? null : new ByteArrayContent(r.Body);
        foreach (var (n, v) in r.Headers.Entries)
        {
            if (n.Equals("content-length", StringComparison.OrdinalIgnoreCase) || n.Equals("host", StringComparison.OrdinalIgnoreCase)) continue;
            if (!msg.Headers.TryAddWithoutValidation(n, v)) content?.Headers.TryAddWithoutValidation(n, v);
        }
        if (r.Cookies.Count > 0 && !r.Headers.Contains("Cookie"))
        {
            var pairs = new List<string>();
            foreach (var (k, v) in r.Cookies) pairs.Add(k + "=" + Cookies.Encode(v));
            msg.Headers.TryAddWithoutValidation("Cookie", string.Join("; ", pairs));
        }
        msg.Content = content;
        var hc = conf.HttpClient ?? DefaultClient;
        using var cts = new CancellationTokenSource(conf.Timeout);
        RawResponse @out;
        try
        {
            using var res = await hc.SendAsync(msg, HttpCompletionOption.ResponseContentRead, cts.Token).ConfigureAwait(false);
            @out = new RawResponse((int)res.StatusCode);
            foreach (var h in res.Headers)
                foreach (var v in h.Value)
                    @out.Headers.Add(h.Key, v);
            foreach (var h in res.Content.Headers)
                foreach (var v in h.Value)
                    @out.Headers.Add(h.Key, v);
            @out.Body = await res.Content.ReadAsByteArrayAsync(cts.Token).ConfigureAwait(false);
            if (res.Headers.TryGetValues("Set-Cookie", out var cookies)) @out.SetCookies = new List<string>(cookies);
        }
        catch (HttpRequestException e)
        {
            throw new ComatypeException.Transport(e.Message, e);
        }
        catch (OperationCanceledException e)
        {
            throw new ComatypeException.Transport("タイムアウトしました", e);
        }
        if (epCookie && conf.CookieJar != null && @out.SetCookies.Count > 0) conf.CookieJar.Store(@out.SetCookies);
        if (cacheKey != null && ResponseCache.Cacheable(@out))
        {
            if (spec!.Memory)
            {
                Cache.Set(cacheKey, @out, spec.TtlMs);
            }
            else
            {
                var v = ResponseCache.EncodeCookie(@out);
                if (v != null)
                {
                    var name = ResponseCache.CookieName(cacheKey);
                    // A cookie ttl is in seconds (rounded up)
                    conf.CookieJar!.Store(new[] { name + "=" + v + "; Path=/; Max-Age=" + Math.Max(1, (spec.TtlMs + 999) / 1000) });
                    CacheCookies[name] = true;
                }
            }
        }
        return @out;
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

namespace Comatype;

/// <summary>
/// The server. Register handlers on <see cref="S"/>, then run it with <see cref="HandleAsync"/> (callable from any framework) or
/// <see cref="Serve"/> (System.Net.HttpListener).
/// </summary>
public sealed class S
{
    /// <summary>The request as seen by wrappers. Ctx holds the values this wrapper adds (the ctx of <c>wrapper</c> in init.comat).</summary>
    public sealed class WrapRequest<TCtx>
    {
        public RawRequest Raw { get; }
        public TCtx? Ctx { get; }

        public WrapRequest(RawRequest raw, TCtx? ctx)
        {
            Raw = raw;
            Ctx = ctx;
        }

        /// <summary>Adds to ctx and builds the request to pass on.</summary>
        public WrapRequest<TCtx> WithCtx(TCtx ctx) => new(Raw, ctx);

        public string? Cookie(string name) => Raw.Cookie(name);

        public string? Header(string name) => Raw.Headers.Get(name);
    }

    /// <summary>Calls the next wrapper (the last one is the handler). The ctx passed to next becomes the ctx of later wrappers and the handler.</summary>
    public delegate Task<RawResponse> Next<TCtx>(WrapRequest<TCtx> req);

    /// <summary>A wrapper implementation. It can rewrite both the request and the response.</summary>
    public delegate Task<RawResponse> ComatypeWrap<TCtx>(WrapRequest<TCtx> req, Next<TCtx> next);

    /// <summary>The untyped form (built by <see cref="Adapt{TCtx}"/>).</summary>
    public delegate Task<RawResponse> ServerWrap(RawRequest req, Func<RawRequest, Task<RawResponse>> next);

    /// <summary>Implemented by the generated Wrappers.</summary>
    public interface IWrapperSet
    {
        IReadOnlyDictionary<string, ServerWrap> ComatypeWrappers();
    }

    /// <summary>Turns a typed wrapper into the untyped form (used by the generated Wrappers).</summary>
    public static ServerWrap Adapt<TCtx>(string name, ComatypeWrap<TCtx> w) =>
        (req, next) =>
        {
            TCtx? ctx = req.Contexts.TryGetValue(name, out var o) && o is TCtx t ? t : default;
            return w(
                new WrapRequest<TCtx>(req, ctx),
                r =>
                {
                    if (r.Ctx != null) r.Raw.Contexts[name] = r.Ctx;
                    return next(r.Raw);
                }
            );
        };

    /// <summary>The return value when a handler wants to add cookies to its result (<c>cookie on</c> endpoints).</summary>
    public sealed record Reply<R>(R Response, CookieValue? Cookie)
    {
        public static Reply<R> Of(R response) => new(response, null);

        /// <summary>Issues the cookie from init.comat.</summary>
        public Reply<R> WithCookie(CookieValue c) => this with { Cookie = c };

        /// <summary>Deletes the cookie.</summary>
        public Reply<R> ClearCookie() => this with { Cookie = CookieValue.Clear() };

        /// <summary>A plain response converts to a reply without a cookie.</summary>
        public static implicit operator Reply<R>(R response) => new(response, null);
    }

    /// <summary>Turns the cookies of a Reply into Set-Cookie of the RawResponse (used by generated code).</summary>
    public static void ApplyCookie(RawResponse result, CookieDef? def, CookieValue? cookie)
    {
        if (cookie != null) result.SetCookies.Add(Cookies.Serialize(def, cookie));
    }

    /// <summary>Gets the ctx added by wrapper name (500 if absent).</summary>
    public static T Ctx<T>(RawRequest raw, string name)
        where T : class
    {
        if (raw.Contexts.TryGetValue(name, out var v) && v is T t) return t;
        throw new ComatypeException("ラッパー " + name + " が ctx を設定していません");
    }

    private sealed class Route
    {
        public string Method = "";
        public string Module = "";
        public List<string> Segs = new();
        public int Statics;
        public IReadOnlyList<string> Wraps = Array.Empty<string>();
        public CacheSpec? Cache;
        public Func<RawRequest, Task<RawResponse>> Handle = null!;
    }

    private readonly object _lock = new();
    private Route[] _routes = Array.Empty<Route>();

    /// <summary>Responses of <c>cache &lt;ttl&gt;</c> (memory) endpoints. Hit on an exact request match.</summary>
    private readonly ResponseCache _cache = new(1000);

    private volatile IReadOnlyDictionary<string, ServerWrap> _wrappers = new Dictionary<string, ServerWrap>();
    private volatile Action<string> _onError = msg => Console.Error.WriteLine("[comatype] " + msg);

    /// <summary>Call once at startup. Requests to endpoints that use a missing wrapper get 500.</summary>
    public S Init(IWrapperSet w)
    {
        _wrappers = w.ComatypeWrappers();
        return this;
    }

    /// <summary>Receives the causes of handler exceptions and of responses that do not match .comat. Defaults to stderr.</summary>
    public S OnError(Action<string> f)
    {
        _onError = f;
        return this;
    }

    public S Get<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, Task<R>> h) => Register("get", ep, h);

    public S Post<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, Task<R>> h) => Register("post", ep, h);

    public S Put<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, Task<R>> h) => Register("put", ep, h);

    public S Patch<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, Task<R>> h) => Register("patch", ep, h);

    public S Delete<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, Task<R>> h) => Register("delete", ep, h);

    public S Options<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, Task<R>> h) => Register("options", ep, h);

    public S Query<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, Task<R>> h) => Register("query", ep, h);

    public S Head<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, Task<R>> h) => Register("head", ep, h);

    // Synchronous handlers
    public S Get<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, R> h) => Register("get", ep, Async(h));

    public S Post<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, R> h) => Register("post", ep, Async(h));

    public S Put<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, R> h) => Register("put", ep, Async(h));

    public S Patch<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, R> h) => Register("patch", ep, Async(h));

    public S Delete<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, R> h) => Register("delete", ep, Async(h));

    public S Options<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, R> h) => Register("options", ep, Async(h));

    public S Query<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, R> h) => Register("query", ep, Async(h));

    public S Head<A, Q, R>(Endpoint<A, Q, R> ep, Func<Q, R> h) => Register("head", ep, Async(h));

    private static Func<Q, Task<R>> Async<Q, R>(Func<Q, R> h) => q => Task.FromResult(h(q));

    private static List<string> Segs(string p) => p.Split('/').Where(s => s.Length > 0).ToList();

    private static string Shape(string method, List<string> segs) => method + " /" + string.Join("/", segs.Select(s => s.StartsWith(':') ? ":" : s));

    private S Register<A, Q, R>(string method, Endpoint<A, Q, R> ep, Func<Q, Task<R>> h)
    {
        if (ep.Method != method)
            throw new ArgumentException("S." + method + "() に " + ep.Method + " のエンドポイント（" + ep.Module + "）は渡せません");
        if (ep.ParseRequest == null || ep.BuildResponse == null)
            throw new ArgumentException(ep.Module + " はサーバ用に生成されていません（role: server で生成してください）");
        var parse = ep.ParseRequest;
        var build = ep.BuildResponse;
        var segs = Segs(ep.Path);
        var r = new Route
        {
            Method = method,
            Module = ep.Module,
            Segs = segs,
            Statics = segs.Count(s => !s.StartsWith(':')),
            Wraps = ep.Wraps,
            Cache = ep.CacheSpec,
            Handle = async raw =>
            {
                Q req;
                try
                {
                    req = parse(raw);
                }
                catch (ValidationException e)
                {
                    var body = new Dictionary<string, object?> { ["code"] = "validation_error", ["message"] = e.Message };
                    if (e.Path.Length != 0) body["path"] = e.Path;
                    return RawResponse.Json(400, body);
                }
                catch (ComatypeException e)
                {
                    return RawResponse.Error(e.Message);
                }
                try
                {
                    return build(await h(req).ConfigureAwait(false));
                }
                catch (ComatypeException e)
                {
                    return RawResponse.Error(e.Message);
                }
            },
        };
        lock (_lock)
        {
            foreach (var o in _routes)
                if (Shape(o.Method, o.Segs) == Shape(r.Method, r.Segs))
                    throw new ArgumentException(Shape(r.Method, r.Segs) + " が重複しています（" + o.Module + " と " + r.Module + "）");
            _routes = _routes.Append(r).ToArray();
        }
        return this;
    }

    /// <summary>The route matching the path (more static segments win). The caller receives params.</summary>
    private Route? Find(string method, List<string> segs, Dictionary<string, string>? @params)
    {
        Route? best = null;
        Dictionary<string, string>? bestParams = null;
        foreach (var r in _routes)
        {
            if (r.Method != method || r.Segs.Count != segs.Count) continue;
            var p = new Dictionary<string, string>();
            var ok = true;
            for (var i = 0; i < r.Segs.Count && ok; i++)
            {
                var want = r.Segs[i];
                if (want.StartsWith(':')) p[want.Substring(1)] = segs[i];
                else ok = want == segs[i];
            }
            if (ok && (best == null || r.Statics > best.Statics))
            {
                best = r;
                bestParams = p;
            }
        }
        if (best != null && @params != null && bestParams != null)
            foreach (var (k, v) in bestParams) @params[k] = v;
        return best;
    }

    private static RawResponse JsonError(int status, string code, string message) =>
        RawResponse.Json(status, new Dictionary<string, object?> { ["code"] = code, ["message"] = message });

    internal static List<(string Name, string Value)> ParseQuery(string? q)
    {
        var @out = new List<(string Name, string Value)>();
        if (string.IsNullOrEmpty(q)) return @out;
        foreach (var p in q.Split('&'))
        {
            if (p.Length == 0) continue;
            var eq = p.IndexOf('=');
            var k = eq < 0 ? p : p.Substring(0, eq);
            var v = eq < 0 ? "" : p.Substring(eq + 1);
            @out.Add((Cookies.Decode(k.Replace('+', ' ')), Cookies.Decode(v.Replace('+', ' '))));
        }
        return @out;
    }

    /// <summary>Handles one request. Target is <c>/path?query</c>. The entry point to call from a framework.</summary>
    public async Task<RawResponse> HandleAsync(string method, string target, Headers headers, byte[] body)
    {
        method = method.ToLowerInvariant();
        var qi = target.IndexOf('?');
        var path = qi < 0 ? target : target.Substring(0, qi);
        var query = qi < 0 ? "" : target.Substring(qi + 1);
        var segs = new List<string>();
        foreach (var s in Segs(path))
        {
            try
            {
                segs.Add(Cookies.Decode(s));
            }
            catch (UriFormatException)
            {
                return JsonError(400, "bad_request", "path が不正です");
            }
        }
        var @params = new Dictionary<string, string>();
        var rt = Find(method, segs, @params);
        if (rt == null)
        {
            var allow = new SortedSet<string>(StringComparer.Ordinal);
            foreach (var o in _routes)
                if (Find(o.Method, segs, null) != null)
                    allow.Add(o.Method.ToUpperInvariant());
            if (allow.Count > 0)
            {
                var joined = string.Join(", ", allow);
                var r405 = JsonError(405, "method_not_allowed", "使えるメソッド: " + joined);
                r405.Headers.Set("Allow", joined);
                return r405;
            }
            return JsonError(404, "not_found", path);
        }

        var raw = new RawRequest(method, path) { Query = ParseQuery(query), Params = @params, Body = body };
        foreach (var c in headers.GetAll("Cookie"))
        {
            foreach (var pair in c.Split(';'))
            {
                var eq = pair.IndexOf('=');
                if (eq <= 0) continue;
                raw.Cookies.TryAdd(pair.Substring(0, eq).Trim(), Cookies.Decode(pair.Substring(eq + 1).Trim()));
            }
        }
        raw.Headers = headers;

        // Cache (GET / QUERY, memory only; cookies are a client-only feature). Looked up before the wrappers, so the key includes all
        // headers (including auth)
        string? cacheKey = null;
        if (rt.Cache != null && rt.Cache.Memory)
        {
            cacheKey = ResponseCache.ServerKey(method, target, headers, body);
            var hit = _cache.Get(cacheKey);
            if (hit != null) return hit;
        }

        var ws = _wrappers;
        var chain = new List<ServerWrap>();
        foreach (var name in rt.Wraps)
        {
            if (!ws.TryGetValue(name, out var w))
            {
                _onError("ラッパー " + name + " が init に渡されていません（" + rt.Module + "）");
                return RawResponse.Error("wrapper missing");
            }
            chain.Add(w);
        }
        RawResponse resp;
        try
        {
            resp = await Run(chain, 0, rt.Handle, raw).ConfigureAwait(false);
        }
        catch (Exception e)
        {
            resp = RawResponse.Error(rt.Module + ": " + e);
        }
        if (resp.Err != null) _onError(rt.Module + ": " + resp.Err);
        else if (cacheKey != null && ResponseCache.Cacheable(resp)) _cache.Set(cacheKey, resp, rt.Cache!.TtlMs);
        return resp;
    }

    private static Task<RawResponse> Run(List<ServerWrap> chain, int i, Func<RawRequest, Task<RawResponse>> handle, RawRequest req) =>
        i == chain.Count ? handle(req) : chain[i](req, r => Run(chain, i + 1, handle, r));

    /// <summary>A running <see cref="HttpListener"/> started by <see cref="Serve"/>.</summary>
    public sealed class Server : IDisposable
    {
        private readonly HttpListener _listener;

        public int Port { get; }

        internal Server(HttpListener listener, int port)
        {
            _listener = listener;
            Port = port;
        }

        public void Stop()
        {
            try
            {
                _listener.Stop();
                _listener.Close();
            }
            catch (ObjectDisposedException) { }
        }

        public void Dispose() => Stop();
    }

    private static int FreePort(IPAddress address)
    {
        var l = new TcpListener(address, 0);
        l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return port;
    }

    /// <summary>Runs on System.Net.HttpListener. With port 0, a free port is used.</summary>
    public Server Serve(string host, int port)
    {
        var address = host is "localhost" or "127.0.0.1" ? IPAddress.Loopback : IPAddress.TryParse(host, out var a) ? a : IPAddress.Any;
        if (port == 0) port = FreePort(address);
        var listener = new HttpListener();
        var name = host is "0.0.0.0" or "*" or "+" ? "+" : host;
        listener.Prefixes.Add("http://" + name + ":" + port + "/");
        listener.Start();
        _ = Task.Run(async () =>
        {
            while (listener.IsListening)
            {
                HttpListenerContext ctx;
                try
                {
                    ctx = await listener.GetContextAsync().ConfigureAwait(false);
                }
                catch (Exception e) when (e is HttpListenerException or ObjectDisposedException or InvalidOperationException)
                {
                    break;
                }
                _ = Task.Run(() => ExchangeAsync(ctx));
            }
        });
        return new Server(listener, port);
    }

    private async Task ExchangeAsync(HttpListenerContext ctx)
    {
        try
        {
            var headers = new Headers();
            foreach (var k in ctx.Request.Headers.AllKeys)
                if (k != null && ctx.Request.Headers[k] is { } v)
                    headers.Add(k, v);
            using var ms = new MemoryStream();
            await ctx.Request.InputStream.CopyToAsync(ms).ConfigureAwait(false);
            var target = ctx.Request.RawUrl ?? "/";
            var r = await HandleAsync(ctx.Request.HttpMethod, target, headers, ms.ToArray()).ConfigureAwait(false);
            var res = ctx.Response;
            res.StatusCode = r.Status;
            foreach (var (n, v) in r.Headers.Entries)
                if (!n.Equals("content-length", StringComparison.OrdinalIgnoreCase))
                    res.AppendHeader(n, v);
            foreach (var c in r.SetCookies) res.AppendHeader("Set-Cookie", c);
            var noBody = r.Status is 204 or 205 or 304 || r.Body.Length == 0 || ctx.Request.HttpMethod.Equals("HEAD", StringComparison.OrdinalIgnoreCase);
            if (noBody)
            {
                res.ContentLength64 = 0;
            }
            else
            {
                res.ContentLength64 = r.Body.Length;
                await res.OutputStream.WriteAsync(r.Body).ConfigureAwait(false);
            }
            res.Close();
        }
        catch (Exception e)
        {
            _onError("serve: " + e);
            try
            {
                ctx.Response.Abort();
            }
            catch (Exception) { }
        }
    }
}

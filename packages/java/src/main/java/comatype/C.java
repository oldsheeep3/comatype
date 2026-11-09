package comatype;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * The client. Call it like `C.get(ENDPOINT, arg)`.
 *
 * <p>The Arg type depends on the request shape: Request if there are params / search / headers,
 * Body if only a body, {@link NoArg} if none.
 */
public final class C {
    private C() {}

    /** Calls the next wrapper (the last one performs the request). */
    @FunctionalInterface
    public interface Next {
        RawResponse call(RawRequest req);
    }

    /**
     * A wrapper implementation. It can rewrite both the request and the response. One per {@code
     * wrapper <name>} in init.comat.
     */
    @FunctionalInterface
    public interface ComatypeWrap {
        RawResponse handle(RawRequest req, Next next);
    }

    /** Implemented by the generated Wrappers. */
    public interface WrapperSet {
        Map<String, ComatypeWrap> comatypeWrappers();
    }

    public static final class Config {
        /** Base url precedence: this &gt; env var COMATYPE_BASE_URL &gt; baseUrl in init.comat */
        public String baseUrl;

        /** The generated Wrappers. An endpoint that uses a missing wrapper is an error */
        public WrapperSet wrappers;

        /** If given, Set-Cookie is kept and sent back for `cookie on` endpoints */
        public CookieJar cookieJar;

        public HttpClient httpClient;

        /** Headers added to every request */
        public Map<String, String> headers = new TreeMap<>();

        public Duration timeout = Duration.ofSeconds(30);

        public Config baseUrl(String v) {
            baseUrl = v;
            return this;
        }

        public Config wrappers(WrapperSet v) {
            wrappers = v;
            return this;
        }

        public Config cookieJar(CookieJar v) {
            cookieJar = v;
            return this;
        }
    }

    /** Responses of `cache <ttl>` (memory) endpoints */
    private static final ResponseCache CACHE = new ResponseCache(1000);

    /** Cookie names of caches stored in cookies (for clearCache) */
    private static final java.util.Set<String> CACHE_COOKIES =
            java.util.concurrent.ConcurrentHashMap.newKeySet();

    /** Discards the caches (memory and those in the cookie jar), e.g. on logout. */
    public static void clearCache() {
        CACHE.clear();
        CookieJar jar = cfg.cookieJar;
        for (String name : CACHE_COOKIES)
            if (jar != null) jar.store(List.of(name + "=; Path=/; Max-Age=0"));
        CACHE_COOKIES.clear();
    }

    private static volatile Config cfg = new Config();
    private static volatile Map<String, ComatypeWrap> wrappers = Collections.emptyMap();
    private static final HttpClient DEFAULT_CLIENT =
            HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

    /** Call once at startup. */
    public static synchronized void init(Config c) {
        cfg = c;
        wrappers = c.wrappers == null ? Collections.emptyMap() : c.wrappers.comatypeWrappers();
    }

    public static <A, Q, R> R get(Endpoint<A, Q, R> ep, A arg) {
        return call("get", ep, arg);
    }

    public static <A, Q, R> R post(Endpoint<A, Q, R> ep, A arg) {
        return call("post", ep, arg);
    }

    public static <A, Q, R> R put(Endpoint<A, Q, R> ep, A arg) {
        return call("put", ep, arg);
    }

    public static <A, Q, R> R patch(Endpoint<A, Q, R> ep, A arg) {
        return call("patch", ep, arg);
    }

    public static <A, Q, R> R delete(Endpoint<A, Q, R> ep, A arg) {
        return call("delete", ep, arg);
    }

    public static <A, Q, R> R options(Endpoint<A, Q, R> ep, A arg) {
        return call("options", ep, arg);
    }

    public static <A, Q, R> R query(Endpoint<A, Q, R> ep, A arg) {
        return call("query", ep, arg);
    }

    public static <A, Q, R> R head(Endpoint<A, Q, R> ep, A arg) {
        return call("head", ep, arg);
    }

    private static <A, Q, R> R call(String method, Endpoint<A, Q, R> ep, A arg) {
        if (!ep.method.equals(method)) {
            throw new ComatypeException.Config(
                    "C." + method + "() に " + ep.method + " のエンドポイント（" + ep.module + "）は渡せません");
        }
        if (ep.buildRequest == null || ep.parseResponse == null) {
            throw new ComatypeException.Config(
                    ep.module + " はクライアント用に生成されていません（role: client で生成してください）");
        }
        Config conf = cfg;
        Map<String, ComatypeWrap> ws = wrappers;
        List<ComatypeWrap> chain = new ArrayList<>();
        for (String name : ep.wraps) {
            ComatypeWrap w = ws.get(name);
            if (w == null)
                throw new ComatypeException.Config(
                        "ラッパー " + name + " が init に渡されていません（" + ep.module + "）");
            chain.add(w);
        }
        RawRequest raw = ep.buildRequest.apply(arg);
        for (Map.Entry<String, String> h : conf.headers.entrySet())
            if (!raw.headers.contains(h.getKey())) raw.headers.set(h.getKey(), h.getValue());
        if (!raw.headers.contains("Accept")) raw.headers.set("Accept", "application/json");
        if (ep.cookie && conf.cookieJar != null) {
            // Cache cookies are not sent back to the server
            conf.cookieJar
                    .get(raw.path)
                    .forEach(
                            (k, v) -> {
                                if (!k.startsWith(ResponseCache.COOKIE_PREFIX))
                                    raw.cookies.put(k, v);
                            });
        }

        Next next = r -> transport(ep, conf, r);
        for (int i = chain.size() - 1; i >= 0; i--) {
            ComatypeWrap w = chain.get(i);
            Next inner = next;
            next = r -> w.handle(r, inner);
        }
        RawResponse resp = next.call(raw);
        if (resp == null)
            throw new ComatypeException.Config("ラッパーが null のレスポンスを返しました（" + ep.module + "）");
        return ep.parseResponse.apply(resp);
    }

    private static RawResponse transport(Endpoint<?, ?, ?> ep, Config conf, RawRequest r) {
        String base = conf.baseUrl;
        if (base == null || base.isEmpty()) base = System.getenv("COMATYPE_BASE_URL");
        if (base == null || base.isEmpty()) base = ep.baseUrl;
        if (base == null || base.isEmpty()) {
            throw new ComatypeException.Config(
                    "base url がありません（Config.baseUrl、環境変数 COMATYPE_BASE_URL、init.comat の baseUrl のどれかで指定してください）");
        }
        StringBuilder url = new StringBuilder(base.replaceAll("/+$", "")).append(r.path);
        if (!r.query.isEmpty()) {
            url.append('?');
            for (int i = 0; i < r.query.size(); i++) {
                if (i > 0) url.append('&');
                url.append(Cookies.encode(r.query.get(i)[0]))
                        .append('=')
                        .append(Cookies.encode(r.query.get(i)[1]));
            }
        }
        // Cache (GET / QUERY): memory or cookie. The key is the method, URL, body and the declared
        // request headers
        String cacheKey = null;
        CacheSpec spec = ep.cache;
        if (spec != null && (spec.memory() || (spec.cookie() && conf.cookieJar != null))) {
            cacheKey =
                    ResponseCache.clientKey(
                            r.method, url.toString(), r.body, ep.cacheHeaders, r.headers);
            RawResponse hit = null;
            if (spec.memory()) {
                hit = CACHE.get(cacheKey);
            } else {
                String v = conf.cookieJar.get("/").get(ResponseCache.cookieName(cacheKey));
                if (v != null) hit = ResponseCache.decodeCookie(v);
            }
            if (hit != null) return hit;
        }
        HttpRequest.BodyPublisher body =
                r.body.length == 0
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofByteArray(r.body);
        HttpRequest.Builder b =
                HttpRequest.newBuilder(URI.create(url.toString()))
                        .timeout(conf.timeout)
                        .method(r.method.toUpperCase(), body);
        for (String[] kv : r.headers.entries()) {
            if (kv[0].equalsIgnoreCase("content-length") || kv[0].equalsIgnoreCase("host"))
                continue;
            b.header(kv[0], kv[1]);
        }
        if (!r.cookies.isEmpty() && !r.headers.contains("Cookie")) {
            List<String> pairs = new ArrayList<>();
            for (Map.Entry<String, String> e : r.cookies.entrySet())
                pairs.add(e.getKey() + "=" + Cookies.encode(e.getValue()));
            b.header("Cookie", String.join("; ", pairs));
        }
        HttpClient hc = conf.httpClient != null ? conf.httpClient : DEFAULT_CLIENT;
        HttpResponse<byte[]> res;
        try {
            res = hc.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException e) {
            throw new ComatypeException.Transport(String.valueOf(e.getMessage()), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ComatypeException.Transport("中断されました", e);
        }
        RawResponse out = new RawResponse(res.statusCode());
        res.headers().map().forEach((k, vs) -> vs.forEach(v -> out.headers.add(k, v)));
        out.body = res.body();
        out.setCookies = new ArrayList<>(res.headers().allValues("set-cookie"));
        if (ep.cookie && conf.cookieJar != null && !out.setCookies.isEmpty())
            conf.cookieJar.store(out.setCookies);
        if (cacheKey != null && ResponseCache.cacheable(out)) {
            if (spec.memory()) {
                CACHE.set(cacheKey, out, spec.ttlMs());
            } else {
                String v = ResponseCache.encodeCookie(out);
                if (v != null) {
                    String name = ResponseCache.cookieName(cacheKey);
                    // A cookie ttl is in seconds (rounded up)
                    conf.cookieJar.store(
                            List.of(
                                    name
                                            + "="
                                            + v
                                            + "; Path=/; Max-Age="
                                            + Math.max(1, (spec.ttlMs() + 999) / 1000)));
                    CACHE_COOKIES.add(name);
                }
            }
        }
        return out;
    }

    static String text(byte[] b) {
        return new String(b, StandardCharsets.UTF_8);
    }
}

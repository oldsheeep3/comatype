package comatype;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.function.Function;

/**
  * The server. Register handlers on {@code S}, then run it with {@link #handle} (callable from any framework)
  * or {@link #serve} (the JDK built-in com.sun.net.httpserver).
 */
public final class S {
    /** The request as seen by wrappers. ctx holds the values this wrapper adds (the ctx of `wrapper` in init.comat). */
    public static final class WrapRequest<Ctx> {
        public final RawRequest raw;
        public final Ctx ctx;

        public WrapRequest(RawRequest raw, Ctx ctx) {
            this.raw = raw;
            this.ctx = ctx;
        }

        /** Adds to ctx and builds the request to pass on. */
        public WrapRequest<Ctx> withCtx(Ctx ctx) {
            return new WrapRequest<>(raw, ctx);
        }

        public String cookie(String name) {
            return raw.cookie(name);
        }

        public String header(String name) {
            return raw.headers.get(name);
        }
    }

    /** Calls the next wrapper (the last one is the handler). The ctx passed to next becomes the ctx of later wrappers and the handler. */
    @FunctionalInterface
    public interface Next<Ctx> {
        RawResponse call(WrapRequest<Ctx> req);
    }

    /** A wrapper implementation. It can rewrite both the request and the response. */
    @FunctionalInterface
    public interface ComatypeWrap<Ctx> {
        RawResponse handle(WrapRequest<Ctx> req, Next<Ctx> next);
    }

    /** The untyped form (built by {@link #adapt}). */
    @FunctionalInterface
    public interface ServerWrap {
        RawResponse handle(RawRequest req, java.util.function.Function<RawRequest, RawResponse> next);
    }

    /** Implemented by the generated Wrappers. */
    public interface WrapperSet {
        Map<String, ServerWrap> comatypeWrappers();
    }

    /** Turns a typed wrapper into the untyped form (used by the generated Wrappers). */
    @SuppressWarnings("unchecked")
    public static <Ctx> ServerWrap adapt(String name, ComatypeWrap<Ctx> w) {
        return (req, next) -> {
            Ctx ctx = (Ctx) req.contexts.get(name);
            return w.handle(new WrapRequest<>(req, ctx), r -> {
                if (r.ctx != null) r.raw.contexts.put(name, r.ctx);
                return next.apply(r.raw);
            });
        };
    }

    /** The return value when a handler wants to add cookies to its result (`cookie on` endpoints). */
    public record Reply<R>(R response, CookieValue cookie) {
        public static <R> Reply<R> of(R response) {
            return new Reply<>(response, null);
        }

        /** Issues the cookie from init.comat */
        public Reply<R> withCookie(CookieValue c) {
            return new Reply<>(response, c);
        }

        /** Deletes the cookie */
        public Reply<R> clearCookie() {
            return new Reply<>(response, CookieValue.clear());
        }
    }

    /** Turns the cookies of a Reply into Set-Cookie of the RawResponse (used by generated code). */
    public static void applyCookie(RawResponse out, CookieDef def, CookieValue cookie) {
        if (cookie != null) out.setCookies.add(Cookies.serialize(def, cookie));
    }

    /** Gets the ctx added by wrapper name (500 if absent). */
    public static <T> T ctx(RawRequest raw, String name, Class<T> cls) {
        Object v = raw.contexts.get(name);
        if (!cls.isInstance(v)) throw new ComatypeException("ラッパー " + name + " が ctx を設定していません");
        return cls.cast(v);
    }

    private static final class Route {
        String method;
        String module;
        List<String> segs;
        int statics;
        List<String> wraps;
        CacheSpec cache;
        Function<RawRequest, RawResponse> handle;
    }

    private final List<Route> routes = new CopyOnWriteArrayList<>();
    /** Responses of `cache <ttl>` (memory) endpoints. Hit on an exact request match */
    private final ResponseCache cache = new ResponseCache(1000);
    private volatile Map<String, ServerWrap> wrappers = Collections.emptyMap();
    private volatile Consumer<String> onError = msg -> System.err.println("[comatype] " + msg);

    /** Call once at startup. Requests to endpoints that use a missing wrapper get 500. */
    public S init(WrapperSet w) {
        wrappers = w.comatypeWrappers();
        return this;
    }

    /** Receives the causes of handler exceptions and of responses that do not match .comat. Defaults to stderr. */
    public S onError(Consumer<String> f) {
        onError = f;
        return this;
    }

    public <Q, R> S get(Endpoint<?, Q, R> ep, Function<Q, R> h) { return register("get", ep, h); }
    public <Q, R> S post(Endpoint<?, Q, R> ep, Function<Q, R> h) { return register("post", ep, h); }
    public <Q, R> S put(Endpoint<?, Q, R> ep, Function<Q, R> h) { return register("put", ep, h); }
    public <Q, R> S patch(Endpoint<?, Q, R> ep, Function<Q, R> h) { return register("patch", ep, h); }
    public <Q, R> S delete(Endpoint<?, Q, R> ep, Function<Q, R> h) { return register("delete", ep, h); }
    public <Q, R> S options(Endpoint<?, Q, R> ep, Function<Q, R> h) { return register("options", ep, h); }
    public <Q, R> S query(Endpoint<?, Q, R> ep, Function<Q, R> h) { return register("query", ep, h); }
    public <Q, R> S head(Endpoint<?, Q, R> ep, Function<Q, R> h) { return register("head", ep, h); }

    private static List<String> segs(String p) {
        List<String> out = new ArrayList<>();
        for (String s : p.split("/")) if (!s.isEmpty()) out.add(s);
        return out;
    }

    private static String shape(String method, List<String> segs) {
        StringBuilder b = new StringBuilder(method).append(" /");
        for (int i = 0; i < segs.size(); i++) {
            if (i > 0) b.append('/');
            b.append(segs.get(i).startsWith(":") ? ":" : segs.get(i));
        }
        return b.toString();
    }

    private <Q, R> S register(String method, Endpoint<?, Q, R> ep, Function<Q, R> h) {
        if (!ep.method.equals(method)) {
            throw new IllegalArgumentException("S." + method + "() に " + ep.method + " のエンドポイント（" + ep.module + "）は渡せません");
        }
        if (ep.parseRequest == null || ep.buildResponse == null) {
            throw new IllegalArgumentException(ep.module + " はサーバ用に生成されていません（role: server で生成してください）");
        }
        Route r = new Route();
        r.method = method;
        r.module = ep.module;
        r.segs = segs(ep.path);
        r.statics = (int) r.segs.stream().filter(s -> !s.startsWith(":")).count();
        r.wraps = ep.wraps;
        r.cache = ep.cache;
        r.handle = raw -> {
            Q req;
            try {
                req = ep.parseRequest.apply(raw);
            } catch (ValidationException e) {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("code", "validation_error");
                body.put("message", e.getMessage());
                if (!e.path.isEmpty()) body.put("path", e.path);
                return RawResponse.json(400, body);
            } catch (ComatypeException e) {
                return RawResponse.error(e.getMessage());
            }
            try {
                return ep.buildResponse.apply(h.apply(req));
            } catch (ComatypeException e) {
                return RawResponse.error(e.getMessage());
            }
        };
        for (Route o : routes) {
            if (shape(o.method, o.segs).equals(shape(r.method, r.segs))) {
                throw new IllegalArgumentException(shape(r.method, r.segs) + " が重複しています（" + o.module + " と " + r.module + "）");
            }
        }
        routes.add(r);
        return this;
    }

    /** The route matching the path (more static segments win). The caller receives params. */
    private Route find(String method, List<String> segs, Map<String, String> params) {
        Route best = null;
        Map<String, String> bestParams = null;
        for (Route r : routes) {
            if (!r.method.equals(method) || r.segs.size() != segs.size()) continue;
            Map<String, String> p = new LinkedHashMap<>();
            boolean ok = true;
            for (int i = 0; i < r.segs.size() && ok; i++) {
                String want = r.segs.get(i);
                if (want.startsWith(":")) p.put(want.substring(1), segs.get(i));
                else ok = want.equals(segs.get(i));
            }
            if (ok && (best == null || r.statics > best.statics)) {
                best = r;
                bestParams = p;
            }
        }
        if (best != null && params != null) params.putAll(bestParams);
        return best;
    }

    private static RawResponse jsonError(int status, String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", message);
        return RawResponse.json(status, body);
    }

    static List<String[]> parseQuery(String q) {
        List<String[]> out = new ArrayList<>();
        if (q == null || q.isEmpty()) return out;
        for (String p : q.split("&")) {
            if (p.isEmpty()) continue;
            int eq = p.indexOf('=');
            String k = eq < 0 ? p : p.substring(0, eq);
            String v = eq < 0 ? "" : p.substring(eq + 1);
            out.add(new String[] {java.net.URLDecoder.decode(k, StandardCharsets.UTF_8), java.net.URLDecoder.decode(v, StandardCharsets.UTF_8)});
        }
        return out;
    }

    /** Handles one request. target is {@code /path?query}. The entry point to call from a framework. */
    public RawResponse handle(String method, String target, Headers headers, byte[] body) {
        method = method.toLowerCase();
        int qi = target.indexOf('?');
        String path = qi < 0 ? target : target.substring(0, qi);
        String query = qi < 0 ? "" : target.substring(qi + 1);
        List<String> segs = new ArrayList<>();
        for (String s : segs(path)) {
            try {
                segs.add(Cookies.decode(s));
            } catch (RuntimeException e) {
                return jsonError(400, "bad_request", "path が不正です");
            }
        }
        Map<String, String> params = new LinkedHashMap<>();
        Route rt = find(method, segs, params);
        if (rt == null) {
            TreeSet<String> allow = new TreeSet<>();
            for (Route o : routes) if (find(o.method, segs, null) != null) allow.add(o.method.toUpperCase());
            if (!allow.isEmpty()) {
                String joined = String.join(", ", allow);
                RawResponse r = jsonError(405, "method_not_allowed", "使えるメソッド: " + joined);
                r.headers.set("Allow", joined);
                return r;
            }
            return jsonError(404, "not_found", path);
        }

        RawRequest raw = new RawRequest(method, path);
        raw.query = parseQuery(query);
        raw.params = params;
        raw.body = body;
        for (String c : headers.getAll("Cookie")) {
            for (String pair : c.split(";")) {
                int eq = pair.indexOf('=');
                if (eq <= 0) continue;
                raw.cookies.putIfAbsent(pair.substring(0, eq).trim(), Cookies.decode(pair.substring(eq + 1).trim()));
            }
        }
        raw.headers = headers;

        // Cache (GET / QUERY, memory only; cookies are a client-only feature). Looked up before the wrappers, so the key includes all headers (including auth)
        String cacheKey = null;
        if (rt.cache != null && rt.cache.memory()) {
            cacheKey = ResponseCache.serverKey(method, target, headers, body);
            RawResponse hit = cache.get(cacheKey);
            if (hit != null) return hit;
        }

        Map<String, ServerWrap> ws = wrappers;
        List<ServerWrap> chain = new ArrayList<>();
        for (String name : rt.wraps) {
            ServerWrap w = ws.get(name);
            if (w == null) {
                onError.accept("ラッパー " + name + " が init に渡されていません（" + rt.module + "）");
                return RawResponse.error("wrapper missing");
            }
            chain.add(w);
        }
        RawResponse resp;
        try {
            resp = run(chain, 0, rt.handle, raw);
        } catch (RuntimeException e) {
            resp = RawResponse.error(rt.module + ": " + e);
        }
        if (resp.err != null) onError.accept(rt.module + ": " + resp.err);
        else if (cacheKey != null && ResponseCache.cacheable(resp)) cache.set(cacheKey, resp, rt.cache.ttlMs());
        return resp;
    }

    private static RawResponse run(List<ServerWrap> chain, int i, Function<RawRequest, RawResponse> handle, RawRequest req) {
        if (i == chain.size()) return handle.apply(req);
        return chain.get(i).handle(req, r -> run(chain, i + 1, handle, r));
    }

    /** Runs on the JDK built-in server. With port 0, a free port is used. */
    public HttpServer serve(String host, int port) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(host, port), 0);
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/", ex -> {
            try {
                exchange(ex);
            } catch (RuntimeException e) {
                onError.accept("serve: " + e);
                ex.close();
            }
        });
        server.start();
        return server;
    }

    private void exchange(HttpExchange ex) throws IOException {
        Headers headers = new Headers();
        ex.getRequestHeaders().forEach((k, vs) -> vs.forEach(v -> headers.add(k, v)));
        byte[] body = ex.getRequestBody().readAllBytes();
        String target = ex.getRequestURI().getRawPath() + (ex.getRequestURI().getRawQuery() == null ? "" : "?" + ex.getRequestURI().getRawQuery());
        RawResponse r = handle(ex.getRequestMethod(), target, headers, body);
        for (String[] kv : r.headers.entries()) if (!kv[0].equalsIgnoreCase("content-length")) ex.getResponseHeaders().add(kv[0], kv[1]);
        for (String c : r.setCookies) ex.getResponseHeaders().add("Set-Cookie", c);
        boolean noBody = r.status == 204 || r.status == 205 || r.status == 304 || r.body.length == 0 || ex.getRequestMethod().equalsIgnoreCase("HEAD");
        if (noBody) {
            ex.sendResponseHeaders(r.status, -1);
        } else {
            ex.sendResponseHeaders(r.status, r.body.length);
            try (OutputStream os = ex.getResponseBody()) {
                os.write(r.body);
            }
        }
        ex.close();
    }
}

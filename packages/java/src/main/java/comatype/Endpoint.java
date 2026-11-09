package comatype;

import java.util.List;
import java.util.function.Function;

/**
  * Endpoint descriptor (held by generated code).
  * Arg is the argument the client passes, Req is the request the server handler receives, Res is the response.
 */
public final class Endpoint<Arg, Req, Res> {
    public final String method;
    public final String path;
    public final String module;
    public final String baseUrl;
    /** From outermost to innermost */
    public final List<String> wraps;
    public final boolean cookie;
    public final CookieDef cookieDef;
    /** The `cache` setting (GET / QUERY only; null means no caching) */
    public CacheSpec cache;
    /** Names of the declared request headers included in the client cache key */
    public List<String> cacheHeaders = List.of();

    // Client
    public final Function<Arg, RawRequest> buildRequest;
    public final Function<RawResponse, Res> parseResponse;
    // Server
    public final Function<RawRequest, Req> parseRequest;
    public final Function<Res, RawResponse> buildResponse;

    private Endpoint(
            String method, String path, String module, String baseUrl, List<String> wraps, boolean cookie, CookieDef cookieDef,
            Function<Arg, RawRequest> buildRequest, Function<RawResponse, Res> parseResponse,
            Function<RawRequest, Req> parseRequest, Function<Res, RawResponse> buildResponse) {
        this.method = method;
        this.path = path;
        this.module = module;
        this.baseUrl = baseUrl;
        this.wraps = wraps;
        this.cookie = cookie;
        this.cookieDef = cookieDef;
        this.buildRequest = buildRequest;
        this.parseResponse = parseResponse;
        this.parseRequest = parseRequest;
        this.buildResponse = buildResponse;
    }

    /** Adds the `cache` setting (used by generated code) */
    public Endpoint<Arg, Req, Res> cache(CacheSpec spec, List<String> headers) {
        this.cache = spec;
        this.cacheHeaders = headers;
        return this;
    }

    public static <Arg, Res> Endpoint<Arg, Void, Res> client(
            String method, String path, String module, String baseUrl, List<String> wraps, boolean cookie, CookieDef cookieDef,
            Function<Arg, RawRequest> buildRequest, Function<RawResponse, Res> parseResponse) {
        return new Endpoint<>(method, path, module, baseUrl, wraps, cookie, cookieDef, buildRequest, parseResponse, null, null);
    }

    public static <Req, Res> Endpoint<Void, Req, Res> server(
            String method, String path, String module, String baseUrl, List<String> wraps, boolean cookie, CookieDef cookieDef,
            Function<RawRequest, Req> parseRequest, Function<Res, RawResponse> buildResponse) {
        return new Endpoint<>(method, path, module, baseUrl, wraps, cookie, cookieDef, null, null, parseRequest, buildResponse);
    }
}

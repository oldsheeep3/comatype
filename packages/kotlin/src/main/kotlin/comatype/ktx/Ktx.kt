// Runtime for Kotlin: c / s that can be written with coroutines (suspend).
// Written with only the standard library (kotlinx.coroutines is not needed); types, validation, cookies and endpoints use the Java runtime (packages/java).
package comatype.ktx

import comatype.CacheSpec
import comatype.ComatypeException
import comatype.ResponseCache
import comatype.CookieJar
import comatype.Cookies
import comatype.Endpoint
import comatype.RawRequest
import comatype.RawResponse
import comatype.S
import java.io.IOException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.startCoroutine
import kotlin.coroutines.suspendCoroutine

/** Awaits a CompletableFuture (does not block the thread). */
suspend fun <T> CompletableFuture<T>.await(): T = suspendCoroutine { c ->
    whenComplete { v, e -> if (e != null) c.resumeWithException(e.cause ?: e) else c.resume(v) }
}

/** Waits on the current thread until a suspend block completes (a bridge connecting server handlers to the synchronous Java S). */
fun <T> blocking(block: suspend () -> T): T {
    val latch = CountDownLatch(1)
    var result: Result<T>? = null
    block.startCoroutine(Continuation(EmptyCoroutineContext) {
        result = it
        latch.countDown()
    })
    latch.await()
    return result!!.getOrThrow()
}

// ---- Client ----

/** Calls the next wrapper (the last one does the network call). */
typealias CNext = suspend (RawRequest) -> RawResponse

/** Client wrapper. It can rewrite both the request and the response. One per `wrapper <name>` in init.comat. */
typealias CWrap = suspend (RawRequest, CNext) -> RawResponse

/** Implemented by the generated Wrappers. */
interface CWrapperSet {
    fun comatypeWrappers(): Map<String, CWrap>
}

/** Client. Call it like `CK.get(ENDPOINT, arg)` (suspend). The network call is HttpClient.sendAsync (non-blocking). */
object CK {
    class Config(
        /** base url priority: here > env var COMATYPE_BASE_URL > baseUrl in init.comat */
        var baseUrl: String? = null,
        var wrappers: CWrapperSet? = null,
        /** If given, keeps Set-Cookie for `cookie on` endpoints and sends the cookies back */
        var cookieJar: CookieJar? = null,
        var httpClient: HttpClient? = null,
        var headers: Map<String, String> = emptyMap(),
        var timeout: Duration = Duration.ofSeconds(30),
    )

    /** Responses of `cache <ttl>` (memory) endpoints */
    private val cache = ResponseCache(1000)

    /** Cookie names of caches stored in cookies (for clearCache) */
    private val cacheCookies = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()

    /** Discards the caches (in memory and in the cookie jar), e.g. on logout. */
    fun clearCache() {
        cache.clear()
        cacheCookies.forEach { cfg.cookieJar?.store(listOf("$it=; Path=/; Max-Age=0")) }
        cacheCookies.clear()
    }

    @Volatile private var cfg = Config()
    @Volatile private var wrappers: Map<String, CWrap> = emptyMap()
    private val defaultClient: HttpClient by lazy { HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build() }

    /** Call once at startup. */
    fun init(config: Config) {
        cfg = config
        wrappers = config.wrappers?.comatypeWrappers() ?: emptyMap()
    }

    suspend fun <A, Q, R> get(ep: Endpoint<A, Q, R>, arg: A): R = call("get", ep, arg)
    suspend fun <A, Q, R> post(ep: Endpoint<A, Q, R>, arg: A): R = call("post", ep, arg)
    suspend fun <A, Q, R> put(ep: Endpoint<A, Q, R>, arg: A): R = call("put", ep, arg)
    suspend fun <A, Q, R> patch(ep: Endpoint<A, Q, R>, arg: A): R = call("patch", ep, arg)
    suspend fun <A, Q, R> delete(ep: Endpoint<A, Q, R>, arg: A): R = call("delete", ep, arg)
    suspend fun <A, Q, R> options(ep: Endpoint<A, Q, R>, arg: A): R = call("options", ep, arg)
    suspend fun <A, Q, R> query(ep: Endpoint<A, Q, R>, arg: A): R = call("query", ep, arg)
    suspend fun <A, Q, R> head(ep: Endpoint<A, Q, R>, arg: A): R = call("head", ep, arg)

    private suspend fun <A, Q, R> call(method: String, ep: Endpoint<A, Q, R>, arg: A): R {
        if (ep.method != method) throw ComatypeException.Config("CK.$method() に ${ep.method} のエンドポイント（${ep.module}）は渡せません")
        val build = ep.buildRequest
        val parse = ep.parseResponse
        if (build == null || parse == null) throw ComatypeException.Config("${ep.module} はクライアント用に生成されていません（role: client で生成してください）")
        val conf = cfg
        val ws = wrappers
        val chain = ep.wraps.map { ws[it] ?: throw ComatypeException.Config("ラッパー $it が init に渡されていません（${ep.module}）") }
        val raw = build.apply(arg)
        conf.headers.forEach { (k, v) -> if (!raw.headers.contains(k)) raw.headers.set(k, v) }
        if (!raw.headers.contains("Accept")) raw.headers.set("Accept", "application/json")
        if (ep.cookie) conf.cookieJar?.let { jar -> jar.get(raw.path).forEach { (k, v) -> if (!k.startsWith(ResponseCache.COOKIE_PREFIX)) raw.cookies[k] = v } } // Do not send cache cookies back

        var next: CNext = { r -> transport(ep, conf, r) }
        for (w in chain.reversed()) {
            val inner = next
            next = { r -> w(r, inner) }
        }
        return parse.apply(next(raw))
    }

    private suspend fun transport(ep: Endpoint<*, *, *>, conf: Config, r: RawRequest): RawResponse {
        var base = conf.baseUrl
        if (base.isNullOrEmpty()) base = System.getenv("COMATYPE_BASE_URL")
        if (base.isNullOrEmpty()) base = ep.baseUrl
        if (base.isNullOrEmpty()) throw ComatypeException.Config("base url がありません（Config.baseUrl、環境変数 COMATYPE_BASE_URL、init.comat の baseUrl のどれかで指定してください）")
        val url = StringBuilder(base.trimEnd('/')).append(r.path)
        if (r.query.isNotEmpty()) url.append('?').append(r.query.joinToString("&") { "${Cookies.encode(it[0])}=${Cookies.encode(it[1])}" })
        // Cache (GET / QUERY): memory or cookie. The key is method, URL, body and the declared request headers
        val spec: CacheSpec? = ep.cache
        var cacheKey: String? = null
        if (spec != null && (spec.memory() || (spec.cookie() && conf.cookieJar != null))) {
            val key = ResponseCache.clientKey(r.method, url.toString(), r.body, ep.cacheHeaders, r.headers)
            cacheKey = key
            val hit = if (spec.memory()) cache.get(key) else conf.cookieJar!!.get("/")[ResponseCache.cookieName(key)]?.let { ResponseCache.decodeCookie(it) }
            if (hit != null) return hit
        }
        val body = if (r.body.isEmpty()) HttpRequest.BodyPublishers.noBody() else HttpRequest.BodyPublishers.ofByteArray(r.body)
        val b = HttpRequest.newBuilder(URI.create(url.toString())).timeout(conf.timeout).method(r.method.uppercase(), body)
        for (kv in r.headers.entries()) if (!kv[0].equals("content-length", true) && !kv[0].equals("host", true)) b.header(kv[0], kv[1])
        if (r.cookies.isNotEmpty() && !r.headers.contains("Cookie")) b.header("Cookie", r.cookies.entries.joinToString("; ") { "${it.key}=${Cookies.encode(it.value)}" })
        val res = try {
            (conf.httpClient ?: defaultClient).sendAsync(b.build(), HttpResponse.BodyHandlers.ofByteArray()).await()
        } catch (e: IOException) {
            throw ComatypeException.Transport(e.message ?: "通信に失敗しました", e)
        }
        val out = RawResponse(res.statusCode())
        res.headers().map().forEach { (k, vs) -> vs.forEach { out.headers.add(k, it) } }
        out.body = res.body()
        out.setCookies = ArrayList(res.headers().allValues("set-cookie"))
        if (ep.cookie && out.setCookies.isNotEmpty()) conf.cookieJar?.store(out.setCookies)
        val key = cacheKey
        if (key != null && spec != null && ResponseCache.cacheable(out)) {
            if (spec.memory()) {
                cache.set(key, out, spec.ttlMs())
            } else {
                ResponseCache.encodeCookie(out)?.let { v ->
                    val name = ResponseCache.cookieName(key)
                    conf.cookieJar!!.store(listOf("$name=$v; Path=/; Max-Age=${maxOf(1L, (spec.ttlMs() + 999) / 1000)}")) // The cookie ttl is in seconds (rounded up)
                    cacheCookies.add(name)
                }
            }
        }
        return out
    }
}

// ---- Server ----

/** The request server wrappers see. ctx holds the values this wrapper adds (the `wrapper` ctx in init.comat). */
class SWrapRequest<Ctx>(val raw: RawRequest, val ctx: Ctx?) {
    /** Adds ctx and makes the request to pass on. */
    fun withCtx(ctx: Ctx) = SWrapRequest(raw, ctx)
    fun cookie(name: String): String? = raw.cookie(name)
    fun header(name: String): String? = raw.headers.get(name)
}

typealias SNext<Ctx> = suspend (SWrapRequest<Ctx>) -> RawResponse

/** Server wrapper. It can rewrite both the request and the response. */
typealias SWrap<Ctx> = suspend (SWrapRequest<Ctx>, SNext<Ctx>) -> RawResponse

/** Implemented by the generated Wrappers. */
interface SWrapperSet {
    fun comatypeWrappers(): Map<String, S.ServerWrap>
}

/** Turns a typed suspend wrapper into the form the Java S uses (used by the generated Wrappers). */
@Suppress("UNCHECKED_CAST")
fun <Ctx> adaptSuspend(name: String, w: SWrap<Ctx>): S.ServerWrap = S.ServerWrap { req, next ->
    blocking {
        w(SWrapRequest(req, req.contexts[name] as? Ctx)) { r ->
            if (r.ctx != null) r.raw.contexts[name] = r.ctx
            next.apply(r.raw)
        }
    }
}

/** Passes the generated Wrappers (suspend wrappers) to S. */
fun S.init(w: SWrapperSet): S = init(S.WrapperSet { w.comatypeWrappers() })

// Registers suspend handlers (the Java S is synchronous, so each request waits for completion on its own thread)
fun <Q, R> S.coGet(ep: Endpoint<*, Q, R>, h: suspend (Q) -> R): S = get(ep) { blocking { h(it) } }
fun <Q, R> S.coPost(ep: Endpoint<*, Q, R>, h: suspend (Q) -> R): S = post(ep) { blocking { h(it) } }
fun <Q, R> S.coPut(ep: Endpoint<*, Q, R>, h: suspend (Q) -> R): S = put(ep) { blocking { h(it) } }
fun <Q, R> S.coPatch(ep: Endpoint<*, Q, R>, h: suspend (Q) -> R): S = patch(ep) { blocking { h(it) } }
fun <Q, R> S.coDelete(ep: Endpoint<*, Q, R>, h: suspend (Q) -> R): S = delete(ep) { blocking { h(it) } }
fun <Q, R> S.coOptions(ep: Endpoint<*, Q, R>, h: suspend (Q) -> R): S = options(ep) { blocking { h(it) } }
fun <Q, R> S.coQuery(ep: Endpoint<*, Q, R>, h: suspend (Q) -> R): S = query(ep) { blocking { h(it) } }
fun <Q, R> S.coHead(ep: Endpoint<*, Q, R>, h: suspend (Q) -> R): S = head(ep) { blocking { h(it) } }

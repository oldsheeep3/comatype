package comatype;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.LongSupplier;

/** Caching (`cache` in `.comat`): an in-memory TTL cache, plus key and cookie encoding. */
public final class ResponseCache {
    /**
     * Prefix of cache cookie names. The client does not send cookies with this prefix back to the
     * server
     */
    public static final String COOKIE_PREFIX = "comatype_cache_";

    /** Maximum length of one cookie value. Larger responses are not cached in cookies */
    public static final int COOKIE_MAX = 3800;

    private record Entry(RawResponse res, long expires) {}

    private final int max;
    private final LongSupplier nowMs;
    private final LinkedHashMap<String, Entry> map = new LinkedHashMap<>();

    public ResponseCache(int max) {
        this(max, System::currentTimeMillis);
    }

    public ResponseCache(int max, LongSupplier nowMs) {
        this.max = max;
        this.nowMs = nowMs;
    }

    /**
     * In-memory cache with a ttl (expired entries are dropped on lookup; above the size limit, the
     * oldest are dropped first)
     */
    public synchronized RawResponse get(String key) {
        Entry e = map.get(key);
        if (e == null) return null;
        if (e.expires <= nowMs.getAsLong()) {
            map.remove(key);
            return null;
        }
        return copy(e.res);
    }

    public synchronized void set(String key, RawResponse res, long ttlMs) {
        map.remove(key);
        map.put(key, new Entry(copy(res), nowMs.getAsLong() + ttlMs));
        while (map.size() > max) map.remove(map.keySet().iterator().next());
    }

    public synchronized void clear() {
        map.clear();
    }

    public synchronized int size() {
        return map.size();
    }

    static RawResponse copy(RawResponse r) {
        RawResponse o = new RawResponse(r.status);
        for (String[] kv : r.headers.entries()) o.headers.add(kv[0], kv[1]);
        o.body = r.body.clone();
        return o;
    }

    /** Whether a response may be cached (2xx, without Set-Cookie) */
    public static boolean cacheable(RawResponse r) {
        return r.status >= 200 && r.status < 300 && r.setCookies.isEmpty();
    }

    /**
     * The client cache key: method, URL (path and query) and body, plus the request headers
     * declared in `.comat`. Headers added by wrappers or Config (e.g. Authorization) are not
     * included.
     */
    public static String clientKey(
            String method, String url, byte[] body, List<String> declared, Headers headers) {
        List<String> names = new ArrayList<>();
        for (String n : declared) names.add(n.toLowerCase());
        names.sort(null);
        StringBuilder b = new StringBuilder(method).append('\n').append(url).append('\n');
        for (String n : names)
            b.append(n)
                    .append(':')
                    .append(headers.get(n) == null ? "" : headers.get(n))
                    .append('\n');
        return b.append('\n').append(new String(body, StandardCharsets.UTF_8)).toString();
    }

    /**
     * The server cache key: an exact match of the request (method, path, query, all headers, body)
     */
    public static String serverKey(String method, String target, Headers headers, byte[] body) {
        Map<String, String> sorted = new TreeMap<>();
        for (String[] kv : headers.entries())
            sorted.merge(kv[0].toLowerCase(), kv[1], (a, c) -> a + ", " + c);
        StringBuilder b = new StringBuilder(method).append('\n').append(target).append('\n');
        sorted.forEach((k, v) -> b.append(k).append(':').append(v).append('\n'));
        return b.append('\n').append(new String(body, StandardCharsets.UTF_8)).toString();
    }

    /** Builds a cookie name from a key (FNV-1a, 64 bit) */
    public static String cookieName(String key) {
        long h = 0xcbf29ce484222325L;
        for (byte x : key.getBytes(StandardCharsets.UTF_8)) h = (h ^ (x & 0xff)) * 0x100000001b3L;
        return COOKIE_PREFIX + String.format("%016x", h);
    }

    /**
     * Encodes a response as a cookie value (base64url of `status\nname\tvalue\n...\n\nbody`). Null
     * if too large
     */
    public static String encodeCookie(RawResponse r) {
        StringBuilder head = new StringBuilder().append(r.status).append('\n');
        for (String[] kv : r.headers.entries())
            head.append(kv[0]).append('\t').append(kv[1]).append('\n');
        head.append('\n');
        byte[] h = head.toString().getBytes(StandardCharsets.UTF_8);
        byte[] all = new byte[h.length + r.body.length];
        System.arraycopy(h, 0, all, 0, h.length);
        System.arraycopy(r.body, 0, all, h.length, r.body.length);
        String v = Base64.getUrlEncoder().withoutPadding().encodeToString(all);
        return v.length() <= COOKIE_MAX ? v : null;
    }

    public static RawResponse decodeCookie(String value) {
        try {
            byte[] raw = Base64.getUrlDecoder().decode(value);
            int pos = -1;
            for (int i = 0; i + 1 < raw.length; i++) {
                if (raw[i] == '\n' && raw[i + 1] == '\n') {
                    pos = i;
                    break;
                }
            }
            if (pos < 0) return null;
            String[] lines = new String(raw, 0, pos, StandardCharsets.UTF_8).split("\n");
            RawResponse out = new RawResponse(Integer.parseInt(lines[0]));
            for (int i = 1; i < lines.length; i++) {
                int tab = lines[i].indexOf('\t');
                if (tab > 0)
                    out.headers.add(lines[i].substring(0, tab), lines[i].substring(tab + 1));
            }
            out.body = java.util.Arrays.copyOfRange(raw, pos + 2, raw.length);
            return out;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}

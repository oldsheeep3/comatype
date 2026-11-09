package comatype;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** The raw request (wire form, with no per-endpoint types) as seen by wrappers. */
public final class RawRequest {
    /** Lowercase (get, post, ...) */
    public String method;

    /** The path after filling in params (client), or the received path (server) */
    public String path;

    public Headers headers = new Headers();
    public List<String[]> query = new ArrayList<>();
    public Map<String, String> params = new LinkedHashMap<>();
    public byte[] body = new byte[0];
    public Map<String, String> cookies = new TreeMap<>();

    /** ctx added by server wrappers (wrapper name -> value) */
    public Map<String, Object> contexts = new LinkedHashMap<>();

    public RawRequest(String method, String path) {
        this.method = method;
        this.path = path;
    }

    /** The value of a received cookie (null if absent) */
    public String cookie(String name) {
        return cookies.get(name);
    }

    public List<String> queryAll(String name) {
        List<String> out = new ArrayList<>();
        for (String[] kv : query) if (kv[0].equals(name)) out.add(kv[1]);
        return out;
    }

    public RawRequest copy() {
        RawRequest r = new RawRequest(method, path);
        r.headers = new Headers();
        for (String[] kv : headers.entries()) r.headers.add(kv[0], kv[1]);
        r.query = new ArrayList<>(query);
        r.params = new LinkedHashMap<>(params);
        r.body = body;
        r.cookies = new TreeMap<>(cookies);
        r.contexts = new LinkedHashMap<>(contexts);
        return r;
    }
}

package comatype;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * A jar for HTTP clients that keep no cookies. Assumes the API is a single origin: ignores Domain
 * and looks only at Path and expiry.
 */
public final class CookieJar {
    private static final class Stored {
        String value;
        String path = "/";
        long expiresAt; // 0 means a session cookie (milliseconds)
    }

    private final Map<String, Stored> m = new TreeMap<>();

    /** Cookies to send for this path. */
    public synchronized Map<String, String> get(String path) {
        long now = System.currentTimeMillis();
        Map<String, String> out = new TreeMap<>();
        m.values().removeIf(c -> c.expiresAt != 0 && c.expiresAt <= now);
        for (Map.Entry<String, Stored> e : m.entrySet()) {
            Stored c = e.getValue();
            String prefix = c.path.endsWith("/") ? c.path : c.path + "/";
            if (c.path.equals("/") || path.equals(c.path) || path.startsWith(prefix))
                out.put(e.getKey(), c.value);
        }
        return out;
    }

    /** Takes in Set-Cookie from a response (Max-Age=0 deletes). */
    public synchronized void store(List<String> lines) {
        for (String line : lines) {
            String[] segs = line.split(";");
            int eq = segs[0].indexOf('=');
            if (eq <= 0) continue;
            String name = segs[0].substring(0, eq).trim();
            Stored c = new Stored();
            c.value = Cookies.decode(segs[0].substring(eq + 1).trim());
            Long maxAge = null;
            for (int i = 1; i < segs.length; i++) {
                String a = segs[i].trim();
                int e2 = a.indexOf('=');
                String k = (e2 < 0 ? a : a.substring(0, e2)).toLowerCase();
                String v = e2 < 0 ? "" : a.substring(e2 + 1);
                if (k.equals("path") && v.startsWith("/")) c.path = v;
                else if (k.equals("max-age")) {
                    try {
                        maxAge = Long.parseLong(v);
                    } catch (NumberFormatException ignored) {
                    }
                }
            }
            if (maxAge != null && maxAge <= 0) {
                m.remove(name);
                continue;
            }
            if (maxAge != null) c.expiresAt = System.currentTimeMillis() + maxAge * 1000;
            m.put(name, c);
        }
    }

    public synchronized void clear() {
        m.clear();
    }
}

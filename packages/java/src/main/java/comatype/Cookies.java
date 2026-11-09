package comatype;

import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Builds Set-Cookie lines for cookies (server). */
public final class Cookies {
    private Cookies() {}

    static final String EPOCH = "Thu, 01 Jan 1970 00:00:00 GMT";

    public static String encode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8).replace("+", "%20");
    }

    public static String decode(String s) {
        try {
            return URLDecoder.decode(s.replace("+", "%2B"), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return s;
        }
    }

    private static String attr(String what, String v) {
        if (v.contains(";") || v.contains("\r") || v.contains("\n")) throw new ComatypeException("cookie の " + what + " に使えない文字があります: " + v);
        return v;
    }

    /** Builds a Set-Cookie value. Attributes (HttpOnly etc.) come from init.comat. */
    public static String serialize(CookieDef def, CookieValue v) {
        if (def == null) {
            throw new ComatypeException("このエンドポイントは cookie を発行できません（cookie off、または init.comat に cookie の宣言がありません）");
        }
        List<String> parts = new ArrayList<>();
        parts.add(def.name() + "=" + encode(v.delete ? "" : v.value));
        String path = v.path != null ? v.path : def.path() != null ? def.path() : "/";
        parts.add("Path=" + attr("path", path));
        String domain = v.domain != null ? v.domain : def.domain();
        if (domain != null) parts.add("Domain=" + attr("domain", domain));
        if (v.delete) {
            parts.add("Max-Age=0");
            parts.add("Expires=" + EPOCH);
        } else {
            Long maxAge = v.maxAge != null ? v.maxAge : def.maxAge();
            if (maxAge != null) {
                if (maxAge < 0) throw new ComatypeException("cookie の maxAge が不正です: " + maxAge);
                parts.add("Max-Age=" + maxAge);
            }
        }
        if (def.httpOnly()) parts.add("HttpOnly");
        if (def.secure()) parts.add("Secure");
        if (def.sameSite() != null) {
            String s = def.sameSite();
            parts.add("SameSite=" + Character.toUpperCase(s.charAt(0)) + s.substring(1));
        }
        return String.join("; ", parts);
    }
}

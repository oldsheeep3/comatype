package comatype;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/** Conversion between the wire form (path, query, headers) and Java values. Used by generated code. */
public final class Wire {
    private Wire() {}

    @FunctionalInterface
    public interface Decoder<T> {
        T decode(String s);
    }

    /** Converts a value to a string. */
    public static String str(Object v) {
        if (v instanceof Email) return ((Email) v).value();
        if (v instanceof Phone) return ((Phone) v).value();
        if (v instanceof BigDecimal) return ((BigDecimal) v).toPlainString();
        if (v instanceof LocalTime) return Codec.time((LocalTime) v);
        if (v instanceof WireEnum) return ((WireEnum) v).wire();
        return String.valueOf(v);
    }

    /** Converts to a list of strings (null becomes empty). */
    public static List<String> strs(Object v) {
        if (v == null) return Collections.emptyList();
        if (v instanceof List) {
            List<String> out = new ArrayList<>();
            for (Object o : (List<?>) v) out.add(str(o));
            return out;
        }
        return List.of(str(v));
    }

    /** Implemented by enums. */
    public interface WireEnum {
        String wire();
    }

    // ---- From strings ----

    public static String string(String s) {
        return s;
    }

    public static boolean bool(String s) {
        if (s.equals("true")) return true;
        if (s.equals("false")) return false;
        throw new IllegalArgumentException("真偽値は true か false にしてください");
    }

    public static long integer(String s) {
        try {
            return Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("整数ではありません");
        }
    }

    public static Email email(String s) {
        return new Email(s);
    }

    public static Phone phone(String s) {
        return new Phone(s);
    }

    public static UUID uuid(String s) {
        return Codec.parseUuid(s, "", 0);
    }

    public static UUID uuidv4(String s) {
        return Codec.parseUuid(s, "", 4);
    }

    public static UUID uuidv7(String s) {
        return Codec.parseUuid(s, "", 7);
    }

    public static java.time.LocalDate date(String s) {
        return Codec.parseDate(s, "");
    }

    public static LocalTime time(String s) {
        return Codec.parseTime(s, "");
    }

    public static java.time.Instant datetime(String s) {
        return Codec.parseDatetime(s, "");
    }

    public static BigDecimal decimal(String s) {
        return Codec.parseDecimal(s, "");
    }

    public static java.net.URI url(String s) {
        return Codec.parseUrl(s, "");
    }

    private static <T> T convert(Decoder<T> d, String s, String name) {
        try {
            return d.decode(s);
        } catch (ValidationException e) {
            throw new ValidationException(name, e.reason);
        } catch (IllegalArgumentException e) {
            throw new ValidationException(name, e.getMessage());
        }
    }

    /** A required value */
    public static <T> T read(List<String> vals, String name, boolean split, Decoder<T> d) {
        if (vals.isEmpty()) throw new ValidationException(name, "必須です");
        return convert(d, vals.get(0), name);
    }

    /** An optional value (null if absent) */
    public static <T> T readOpt(List<String> vals, String name, boolean split, Decoder<T> d) {
        return vals.isEmpty() ? null : convert(d, vals.get(0), name);
    }

    /** An array. For `split` (headers) it arrives as one ", "-separated value. Use `optional` for an optional array */
    public static <T> List<T> readList(List<String> vals, String name, boolean split, boolean optional, Decoder<T> d) {
        if (vals.isEmpty()) {
            if (optional) return null;
            throw new ValidationException(name, "必須です");
        }
        List<String> items = vals;
        if (split && vals.size() == 1) {
            items = new ArrayList<>();
            if (!vals.get(0).trim().isEmpty()) for (String p : vals.get(0).split(",")) items.add(p.trim());
        }
        List<T> out = new ArrayList<>();
        for (String it : items) out.add(convert(d, it, name));
        return out;
    }

    // ---- Building requests (client). kv is name, value, name, value, ... ----

    /** Fills in `:name` in the path. */
    public static void fillPath(RawRequest raw, Object... kv) {
        String[] segs = raw.path.split("/", -1);
        for (int i = 0; i < segs.length; i++) {
            if (!segs[i].startsWith(":")) continue;
            String name = segs[i].substring(1);
            String v = null;
            for (int k = 0; k + 1 < kv.length; k += 2) {
                if (kv[k].equals(name)) {
                    List<String> vs = strs(kv[k + 1]);
                    if (!vs.isEmpty()) v = vs.get(0);
                }
            }
            if (v == null || v.isEmpty()) throw new ValidationException(name, "必須です");
            raw.params.put(name, v);
            segs[i] = Cookies.encode(v);
        }
        raw.path = String.join("/", segs);
    }

    public static void addQuery(RawRequest raw, Object... kv) {
        for (int k = 0; k + 1 < kv.length; k += 2) for (String v : strs(kv[k + 1])) raw.query.add(new String[] {(String) kv[k], v});
    }

    /** Writes a header. Arrays are joined with ", ". null is not written. */
    public static void setHeaders(Headers h, Object... kv) {
        for (int k = 0; k + 1 < kv.length; k += 2) {
            List<String> vs = strs(kv[k + 1]);
            if (!vs.isEmpty()) h.set((String) kv[k], String.join(", ", vs));
        }
    }

    // ---- Reading received values ----

    public static List<String> paramValues(RawRequest raw, String name) {
        String v = raw.params.get(name);
        return v == null ? Collections.emptyList() : List.of(v);
    }

    public static List<String> queryValues(RawRequest raw, String name) {
        return raw.queryAll(name);
    }

    public static List<String> headerValues(Headers h, String name) {
        return h.getAll(name);
    }
}

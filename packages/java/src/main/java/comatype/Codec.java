package comatype;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;

/** Conversion between JSON trees and Java values. Used by generated code. */
public final class Codec {
    private Codec() {}

    @FunctionalInterface
    public interface Decoder<T> {
        T decode(Object json, String path);
    }

    private static ValidationException fail(String path, String reason) {
        return new ValidationException(path, reason);
    }

    private static String describe(Object j) {
        return j == null ? "null" : j instanceof String ? "文字列" : j instanceof Boolean ? "真偽値" : j instanceof Number ? "数値" : j instanceof List ? "配列" : "オブジェクト";
    }

    // ---- Reading ----

    @SuppressWarnings("unchecked")
    public static Map<String, Object> object(Object j, String path) {
        if (!(j instanceof Map)) throw fail(path, "オブジェクトにしてください（" + describe(j) + " でした）");
        return (Map<String, Object>) j;
    }

    @SuppressWarnings("unchecked")
    public static List<Object> array(Object j, String path) {
        if (!(j instanceof List)) throw fail(path, "配列にしてください（" + describe(j) + " でした）");
        return (List<Object>) j;
    }

    public static String string(Object j, String path) {
        if (!(j instanceof String)) throw fail(path, "文字列にしてください（" + describe(j) + " でした）");
        return (String) j;
    }

    public static boolean bool(Object j, String path) {
        if (!(j instanceof Boolean)) throw fail(path, "真偽値にしてください（" + describe(j) + " でした）");
        return (Boolean) j;
    }

    public static long integer(Object j, String path) {
        if (j instanceof Long) return (Long) j;
        if (j instanceof Double && (Double) j == Math.rint((Double) j) && Math.abs((Double) j) < 9e15) return (long) (double) (Double) j;
        throw fail(path, "整数にしてください（" + describe(j) + " でした）");
    }

    /** A 64-bit integer, a string on the wire */
    public static long int64(Object j, String path) {
        try {
            return Long.parseLong(string(j, path));
        } catch (NumberFormatException e) {
            throw fail(path, "int64 は整数の文字列で送ってください");
        }
    }

    public static Email email(Object j, String path) {
        Email e = new Email(string(j, path));
        e.validate(path);
        return e;
    }

    public static Phone phone(Object j, String path) {
        Phone p = new Phone(string(j, path));
        p.validate(path);
        return p;
    }

    public static UUID uuid(Object j, String path) {
        return parseUuid(string(j, path), path, 0);
    }

    public static UUID uuidv4(Object j, String path) {
        return parseUuid(string(j, path), path, 4);
    }

    public static UUID uuidv7(Object j, String path) {
        return parseUuid(string(j, path), path, 7);
    }

    private static final Pattern UUID_RE = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    public static UUID parseUuid(String s, String path, int version) {
        String label = version == 0 ? "uuid" : "uuidv" + version;
        if (!UUID_RE.matcher(s).matches()) throw fail(path, label + " の形式が不正です");
        UUID u = UUID.fromString(s);
        if (version != 0) Check.uuidVersion(path, u, version);
        return u;
    }

    public static LocalDate date(Object j, String path) {
        return parseDate(string(j, path), path);
    }

    public static LocalDate parseDate(String s, String path) {
        try {
            if (!s.matches("^\\d{4}-\\d{2}-\\d{2}$")) throw new DateTimeParseException("", s, 0);
            return LocalDate.parse(s);
        } catch (DateTimeParseException e) {
            throw fail(path, "date は YYYY-MM-DD の形式にしてください");
        }
    }

    public static LocalTime time(Object j, String path) {
        return parseTime(string(j, path), path);
    }

    public static LocalTime parseTime(String s, String path) {
        if (!s.matches("^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$")) throw fail(path, "time は HH:MM:SS の形式にしてください");
        return LocalTime.parse(s);
    }

    public static Instant datetime(Object j, String path) {
        return parseDatetime(string(j, path), path);
    }

    public static Instant parseDatetime(String s, String path) {
        try {
            return OffsetDateTime.parse(s).toInstant();
        } catch (DateTimeParseException e) {
            throw fail(path, "datetime は RFC 3339 の形式にしてください");
        }
    }

    public static BigDecimal decimal(Object j, String path) {
        return parseDecimal(string(j, path), path);
    }

    public static BigDecimal parseDecimal(String s, String path) {
        if (!s.matches("^-?\\d+(\\.\\d+)?$")) throw fail(path, "decimal は数値の文字列にしてください");
        return new BigDecimal(s);
    }

    public static URI url(Object j, String path) {
        return parseUrl(string(j, path), path);
    }

    public static URI parseUrl(String s, String path) {
        try {
            URI u = new URI(s);
            if (u.getScheme() == null || u.getHost() == null) throw new URISyntaxException(s, "no host");
            return u;
        } catch (URISyntaxException e) {
            throw fail(path, "url は http(s)://host/... の形式にしてください");
        }
    }

    public static byte[] bytes(Object j, String path) {
        try {
            return Base64.getDecoder().decode(string(j, path));
        } catch (IllegalArgumentException e) {
            throw fail(path, "bytes は base64 の文字列にしてください");
        }
    }

    public static Object json(Object j, String path) {
        return j;
    }

    public static <T> List<T> list(Object j, String path, Decoder<T> d) {
        List<Object> src = array(j, path);
        List<T> out = new ArrayList<>(src.size());
        for (int i = 0; i < src.size(); i++) out.add(d.decode(src.get(i), path + "[" + i + "]"));
        return out;
    }

    /** Allows null (`T | null`) */
    public static <T> Decoder<T> nullable(Decoder<T> d) {
        return (j, p) -> j == null ? null : d.decode(j, p);
    }

    /** A required field (when missing: "required") */
    public static <T> T req(Map<String, Object> m, String name, String path, Decoder<T> d) {
        String p = ValidationException.join(path, name);
        if (!m.containsKey(name)) throw fail(p, "必須です");
        return d.decode(m.get(name), p);
    }

    /** An optional field (null if absent or null) */
    public static <T> T opt(Map<String, Object> m, String name, String path, Decoder<T> d) {
        Object v = m.get(name);
        return v == null ? null : d.decode(v, ValidationException.join(path, name));
    }

    // ---- Writing ----

    public static String int64(long v) {
        return Long.toString(v);
    }

    public static String decimal(BigDecimal v) {
        return v.toPlainString();
    }

    public static String time(LocalTime v) {
        return String.format("%02d:%02d:%02d", v.getHour(), v.getMinute(), v.getSecond());
    }

    public static String bytes(byte[] v) {
        return Base64.getEncoder().encodeToString(v);
    }

    public static <T> List<Object> list(List<T> v, Function<T, Object> f) {
        List<Object> out = new ArrayList<>(v.size());
        for (T t : v) out.add(t == null ? null : f.apply(t));
        return out;
    }

    // ---- Body ----

    /** Validates, then converts to JSON bytes. */
    public static byte[] encode(JsonType v) {
        v.validate("");
        return Json.bytes(v.encode());
    }

    public static byte[] encodeValue(Object tree) {
        return Json.bytes(tree);
    }

    public static <T> T decode(byte[] data, Decoder<T> d) {
        return d.decode(Json.parse(data), "");
    }

    /** Reads a body. Error paths start from `path`. */
    public static <T> T decode(byte[] data, String path, Decoder<T> d) {
        Object json;
        try {
            json = Json.parse(data);
        } catch (ValidationException e) {
            throw new ValidationException(path, e.reason);
        }
        return d.decode(json, path);
    }
}

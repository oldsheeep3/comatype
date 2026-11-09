package comatype;

import java.math.BigDecimal;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/** Validation and constraints (min / max / pattern / oneof). */
public final class Check {
    private Check() {}

    /** Length range (`string(1..50)`) */
    public static void len(String path, String s, Long min, Long max) {
        long n = s.codePointCount(0, s.length());
        if (min != null && n < min) throw new ValidationException(path, "文字数は " + min + " 以上にしてください");
        if (max != null && n > max) throw new ValidationException(path, "文字数は " + max + " 以下にしてください");
    }

    /** Value range (`int(0..150)`) */
    public static void range(String path, double n, Long min, Long max) {
        if (min != null && n < min) throw new ValidationException(path, "値は " + min + " 以上にしてください");
        if (max != null && n > max) throw new ValidationException(path, "値は " + max + " 以下にしてください");
    }

    public static void range(String path, BigDecimal n, Long min, Long max) {
        range(path, n.doubleValue(), min, max);
    }

    public static void pattern(String path, String s, String pattern) {
        Pattern re;
        try {
            re = Pattern.compile(pattern);
        } catch (PatternSyntaxException e) {
            throw new ValidationException(path, "pattern \"" + pattern + "\" が不正です");
        }
        if (!re.matcher(s).find()) throw new ValidationException(path, "パターン " + pattern + " に一致しません");
    }

    public static void oneOf(String path, String s, String... values) {
        for (String v : values) if (v.equals(s)) return;
        throw new ValidationException(path, String.join(" | ", values) + " のどれかにしてください");
    }

    public static void uuidVersion(String path, UUID u, int version) {
        if (u.version() != version || u.variant() != 2) throw new ValidationException(path, "uuidv" + version + " の形式が不正です");
    }
}

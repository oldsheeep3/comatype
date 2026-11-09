package comatype;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Dependency-free JSON. The tree is Map&lt;String,Object&gt; / List&lt;Object&gt; / String / Long /
 * Double / Boolean / null.
 */
public final class Json {
    private Json() {}

    public static Object parse(String text) {
        P p = new P(text);
        p.ws();
        Object v = p.value();
        p.ws();
        if (p.i != text.length()) throw p.err("余分な文字があります");
        return v;
    }

    public static Object parse(byte[] data) {
        return parse(new String(data, java.nio.charset.StandardCharsets.UTF_8));
    }

    private static final class P {
        final String s;
        int i;

        P(String s) {
            this.s = s;
        }

        ValidationException err(String m) {
            return new ValidationException("", "JSON として読めません: " + m + "（位置 " + i + "）");
        }

        void ws() {
            while (i < s.length() && " \t\r\n".indexOf(s.charAt(i)) >= 0) i++;
        }

        Object value() {
            if (i >= s.length()) throw err("途中で終わっています");
            char c = s.charAt(i);
            switch (c) {
                case '{':
                    return object();
                case '[':
                    return array();
                case '"':
                    return string();
                case 't':
                    return lit("true", Boolean.TRUE);
                case 'f':
                    return lit("false", Boolean.FALSE);
                case 'n':
                    return lit("null", null);
                default:
                    return number();
            }
        }

        Object lit(String word, Object v) {
            if (!s.startsWith(word, i)) throw err("不正な値");
            i += word.length();
            return v;
        }

        Map<String, Object> object() {
            Map<String, Object> m = new LinkedHashMap<>();
            i++;
            ws();
            if (i < s.length() && s.charAt(i) == '}') {
                i++;
                return m;
            }
            while (true) {
                ws();
                if (i >= s.length() || s.charAt(i) != '"') throw err("キーは文字列にしてください");
                String k = string();
                ws();
                if (i >= s.length() || s.charAt(i) != ':') throw err("':' がありません");
                i++;
                ws();
                m.put(k, value());
                ws();
                if (i >= s.length()) throw err("途中で終わっています");
                char c = s.charAt(i++);
                if (c == '}') return m;
                if (c != ',') throw err("',' か '}' が必要です");
            }
        }

        List<Object> array() {
            List<Object> l = new ArrayList<>();
            i++;
            ws();
            if (i < s.length() && s.charAt(i) == ']') {
                i++;
                return l;
            }
            while (true) {
                ws();
                l.add(value());
                ws();
                if (i >= s.length()) throw err("途中で終わっています");
                char c = s.charAt(i++);
                if (c == ']') return l;
                if (c != ',') throw err("',' か ']' が必要です");
            }
        }

        String string() {
            StringBuilder b = new StringBuilder();
            i++;
            while (true) {
                if (i >= s.length()) throw err("文字列が閉じていません");
                char c = s.charAt(i++);
                if (c == '"') return b.toString();
                if (c < 0x20) throw err("制御文字は使えません");
                if (c != '\\') {
                    b.append(c);
                    continue;
                }
                if (i >= s.length()) throw err("途中で終わっています");
                char e = s.charAt(i++);
                switch (e) {
                    case '"':
                        b.append('"');
                        break;
                    case '\\':
                        b.append('\\');
                        break;
                    case '/':
                        b.append('/');
                        break;
                    case 'b':
                        b.append('\b');
                        break;
                    case 'f':
                        b.append('\f');
                        break;
                    case 'n':
                        b.append('\n');
                        break;
                    case 'r':
                        b.append('\r');
                        break;
                    case 't':
                        b.append('\t');
                        break;
                    case 'u':
                        if (i + 4 > s.length()) throw err("\\u が不正です");
                        try {
                            b.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        } catch (NumberFormatException ex) {
                            throw err("\\u が不正です");
                        }
                        i += 4;
                        break;
                    default:
                        throw err("不正なエスケープ");
                }
            }
        }

        Object number() {
            int st = i;
            if (i < s.length() && s.charAt(i) == '-') i++;
            boolean frac = false;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c >= '0' && c <= '9') i++;
                else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') {
                    frac = true;
                    i++;
                } else break;
            }
            String t = s.substring(st, i);
            if (t.isEmpty() || t.equals("-")) throw err("不正な値");
            try {
                if (!frac) {
                    try {
                        return Long.parseLong(t);
                    } catch (NumberFormatException ex) {
                        return new BigDecimal(t).doubleValue();
                    }
                }
                return Double.parseDouble(t);
            } catch (NumberFormatException ex) {
                throw err("不正な数値 " + t);
            }
        }
    }

    public static String stringify(Object v) {
        StringBuilder b = new StringBuilder();
        write(b, v);
        return b.toString();
    }

    public static byte[] bytes(Object v) {
        return stringify(v).getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private static void write(StringBuilder b, Object v) {
        if (v == null) {
            b.append("null");
        } else if (v instanceof String) {
            quote(b, (String) v);
        } else if (v instanceof Boolean || v instanceof Long || v instanceof Integer) {
            b.append(v);
        } else if (v instanceof Double) {
            double d = (Double) v;
            if (Double.isNaN(d) || Double.isInfinite(d))
                throw new ValidationException("", "数値が有限ではありません");
            b.append(
                    d == Math.rint(d) && Math.abs(d) < 1e15
                            ? Long.toString((long) d)
                            : Double.toString(d));
        } else if (v instanceof Map) {
            b.append('{');
            boolean first = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) {
                if (!first) b.append(',');
                first = false;
                quote(b, e.getKey());
                b.append(':');
                write(b, e.getValue());
            }
            b.append('}');
        } else if (v instanceof List) {
            b.append('[');
            boolean first = true;
            for (Object o : (List<Object>) v) {
                if (!first) b.append(',');
                first = false;
                write(b, o);
            }
            b.append(']');
        } else {
            throw new IllegalArgumentException("JSON にできない型: " + v.getClass());
        }
    }

    private static void quote(StringBuilder b, String s) {
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':
                    b.append("\\\"");
                    break;
                case '\\':
                    b.append("\\\\");
                    break;
                case '\n':
                    b.append("\\n");
                    break;
                case '\r':
                    b.append("\\r");
                    break;
                case '\t':
                    b.append("\\t");
                    break;
                case '\b':
                    b.append("\\b");
                    break;
                case '\f':
                    b.append("\\f");
                    break;
                default:
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        b.append('"');
    }
}

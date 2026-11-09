using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Comatype;

/// <summary>
/// Dependency-free JSON. The tree is Dictionary&lt;string, object?&gt; / List&lt;object?&gt; / string / long / double / bool / null.
/// </summary>
public static class Json
{
    public static object? Parse(string text)
    {
        var p = new Parser(text);
        p.Ws();
        var v = p.Value();
        p.Ws();
        if (p.I != text.Length) throw p.Err("余分な文字があります");
        return v;
    }

    public static object? Parse(byte[] data) => Parse(Encoding.UTF8.GetString(data));

    private sealed class Parser
    {
        private readonly string _s;
        public int I;

        public Parser(string s)
        {
            _s = s;
        }

        public ValidationException Err(string m) => new("", "JSON として読めません: " + m + "（位置 " + I + "）");

        public void Ws()
        {
            while (I < _s.Length && " \t\r\n".IndexOf(_s[I]) >= 0) I++;
        }

        public object? Value()
        {
            if (I >= _s.Length) throw Err("途中で終わっています");
            switch (_s[I])
            {
                case '{':
                    return Obj();
                case '[':
                    return Arr();
                case '"':
                    return Str();
                case 't':
                    return Lit("true", true);
                case 'f':
                    return Lit("false", false);
                case 'n':
                    return Lit("null", null);
                default:
                    return Num();
            }
        }

        private object? Lit(string word, object? v)
        {
            if (string.CompareOrdinal(_s, I, word, 0, word.Length) != 0) throw Err("不正な値");
            I += word.Length;
            return v;
        }

        private Dictionary<string, object?> Obj()
        {
            var m = new Dictionary<string, object?>();
            I++;
            Ws();
            if (I < _s.Length && _s[I] == '}')
            {
                I++;
                return m;
            }
            while (true)
            {
                Ws();
                if (I >= _s.Length || _s[I] != '"') throw Err("キーは文字列にしてください");
                var k = Str();
                Ws();
                if (I >= _s.Length || _s[I] != ':') throw Err("':' がありません");
                I++;
                Ws();
                m[k] = Value();
                Ws();
                if (I >= _s.Length) throw Err("途中で終わっています");
                var c = _s[I++];
                if (c == '}') return m;
                if (c != ',') throw Err("',' か '}' が必要です");
            }
        }

        private List<object?> Arr()
        {
            var l = new List<object?>();
            I++;
            Ws();
            if (I < _s.Length && _s[I] == ']')
            {
                I++;
                return l;
            }
            while (true)
            {
                Ws();
                l.Add(Value());
                Ws();
                if (I >= _s.Length) throw Err("途中で終わっています");
                var c = _s[I++];
                if (c == ']') return l;
                if (c != ',') throw Err("',' か ']' が必要です");
            }
        }

        private string Str()
        {
            var b = new StringBuilder();
            I++;
            while (true)
            {
                if (I >= _s.Length) throw Err("文字列が閉じていません");
                var c = _s[I++];
                if (c == '"') return b.ToString();
                if (c < 0x20) throw Err("制御文字は使えません");
                if (c != '\\')
                {
                    b.Append(c);
                    continue;
                }
                if (I >= _s.Length) throw Err("途中で終わっています");
                var e = _s[I++];
                switch (e)
                {
                    case '"':
                        b.Append('"');
                        break;
                    case '\\':
                        b.Append('\\');
                        break;
                    case '/':
                        b.Append('/');
                        break;
                    case 'b':
                        b.Append('\b');
                        break;
                    case 'f':
                        b.Append('\f');
                        break;
                    case 'n':
                        b.Append('\n');
                        break;
                    case 'r':
                        b.Append('\r');
                        break;
                    case 't':
                        b.Append('\t');
                        break;
                    case 'u':
                        if (I + 4 > _s.Length || !int.TryParse(_s.AsSpan(I, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var code))
                            throw Err("\\u が不正です");
                        b.Append((char)code);
                        I += 4;
                        break;
                    default:
                        throw Err("不正なエスケープ");
                }
            }
        }

        private object Num()
        {
            var st = I;
            if (I < _s.Length && _s[I] == '-') I++;
            var frac = false;
            while (I < _s.Length)
            {
                var c = _s[I];
                if (c >= '0' && c <= '9') I++;
                else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-')
                {
                    frac = true;
                    I++;
                }
                else break;
            }
            var t = _s.Substring(st, I - st);
            if (t.Length == 0 || t == "-") throw Err("不正な値");
            if (!frac && long.TryParse(t, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var l)) return l;
            if (double.TryParse(t, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return d;
            throw Err("不正な数値 " + t);
        }
    }

    public static string Stringify(object? v)
    {
        var b = new StringBuilder();
        Write(b, v);
        return b.ToString();
    }

    public static byte[] Bytes(object? v) => Encoding.UTF8.GetBytes(Stringify(v));

    private static void Write(StringBuilder b, object? v)
    {
        switch (v)
        {
            case null:
                b.Append("null");
                break;
            case string s:
                Quote(b, s);
                break;
            case bool bo:
                b.Append(bo ? "true" : "false");
                break;
            case long or int:
                b.Append(Convert.ToString(v, CultureInfo.InvariantCulture));
                break;
            case double d:
                if (double.IsNaN(d) || double.IsInfinity(d)) throw new ValidationException("", "数値が有限ではありません");
                b.Append(d == Math.Round(d) && Math.Abs(d) < 1e15 ? ((long)d).ToString(CultureInfo.InvariantCulture) : d.ToString("R", CultureInfo.InvariantCulture));
                break;
            case IDictionary<string, object?> m:
                {
                    b.Append('{');
                    var first = true;
                    foreach (var e in m)
                    {
                        if (!first) b.Append(',');
                        first = false;
                        Quote(b, e.Key);
                        b.Append(':');
                        Write(b, e.Value);
                    }
                    b.Append('}');
                    break;
                }
            case IEnumerable l:
                {
                    b.Append('[');
                    var first = true;
                    foreach (var o in l)
                    {
                        if (!first) b.Append(',');
                        first = false;
                        Write(b, o);
                    }
                    b.Append(']');
                    break;
                }
            default:
                throw new ArgumentException("JSON にできない型: " + v.GetType());
        }
    }

    private static void Quote(StringBuilder b, string s)
    {
        b.Append('"');
        foreach (var c in s)
        {
            switch (c)
            {
                case '"':
                    b.Append("\\\"");
                    break;
                case '\\':
                    b.Append("\\\\");
                    break;
                case '\n':
                    b.Append("\\n");
                    break;
                case '\r':
                    b.Append("\\r");
                    break;
                case '\t':
                    b.Append("\\t");
                    break;
                case '\b':
                    b.Append("\\b");
                    break;
                case '\f':
                    b.Append("\\f");
                    break;
                default:
                    if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    else b.Append(c);
                    break;
            }
        }
        b.Append('"');
    }
}

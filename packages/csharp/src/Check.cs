using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace Comatype;

/// <summary>Validation and constraints (min / max / pattern / oneof).</summary>
public static class Check
{
    /// <summary>Length range (`string(1..50)`), counted in code points.</summary>
    public static void Len(string path, string s, long? min, long? max)
    {
        long n = s.EnumerateRunes().Count();
        if (min != null && n < min) throw new ValidationException(path, "文字数は " + min + " 以上にしてください");
        if (max != null && n > max) throw new ValidationException(path, "文字数は " + max + " 以下にしてください");
    }

    /// <summary>Value range (`int(0..150)`).</summary>
    public static void Range(string path, double n, long? min, long? max)
    {
        if (min != null && n < min) throw new ValidationException(path, "値は " + min + " 以上にしてください");
        if (max != null && n > max) throw new ValidationException(path, "値は " + max + " 以下にしてください");
    }

    public static void Pattern(string path, string s, string pattern)
    {
        Regex re;
        try
        {
            re = new Regex(pattern);
        }
        catch (ArgumentException)
        {
            throw new ValidationException(path, "pattern \"" + pattern + "\" が不正です");
        }
        if (!re.IsMatch(s)) throw new ValidationException(path, "パターン " + pattern + " に一致しません");
    }

    public static void OneOf(string path, string s, params string[] values)
    {
        if (values.Contains(s)) return;
        throw new ValidationException(path, string.Join(" | ", values) + " のどれかにしてください");
    }

    public static void UuidVersion(string path, Guid u, int version)
    {
        // xxxxxxxx-xxxx-Vxxx-Wxxx-xxxxxxxxxxxx: V is the version, W the variant (8, 9, a or b)
        var s = u.ToString("D");
        if (s[14] - '0' != version || "89abAB".IndexOf(s[19]) < 0)
            throw new ValidationException(path, "uuidv" + version + " の形式が不正です");
    }
}

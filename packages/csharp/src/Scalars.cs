using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Reflection;
using System.Text.RegularExpressions;

namespace Comatype;

/// <summary>An email address. A string on the wire.</summary>
public sealed record Email(string Value)
{
    private static readonly Regex Re = new(@"^[^\s@]+@[^\s@]+\.[^\s@]+$", RegexOptions.Compiled);

    public void Validate(string path)
    {
        if (Value == null || !Re.IsMatch(Value)) throw new ValidationException(path, "email の形式が不正です");
    }

    public override string ToString() => Value;
}

/// <summary>An E.164 phone number. A string on the wire.</summary>
public sealed record Phone(string Value)
{
    private static readonly Regex Re = new(@"^\+[1-9]\d{1,14}$", RegexOptions.Compiled);

    public void Validate(string path)
    {
        if (Value == null || !Re.IsMatch(Value)) throw new ValidationException(path, "phone は E.164 の形式にしてください");
    }

    public override string ToString() => Value;
}

/// <summary>The Arg of an endpoint that takes no request arguments.</summary>
public sealed class NoArg
{
    public static readonly NoArg Instance = new();

    private NoArg() { }
}

/// <summary>Implemented by generated object types.</summary>
public interface IJsonType
{
    /// <summary>Checks that the value matches the .comat type (including constraints).</summary>
    void Validate(string path);

    /// <summary>Converts to a JSON tree (assumes the value is already validated).</summary>
    object? Encode();
}

/// <summary>The value an enum member has on the wire (the string in `enum` of .comat). Put on the members of generated enums.</summary>
[AttributeUsage(AttributeTargets.Field)]
public sealed class WireNameAttribute : Attribute
{
    public string Name { get; }

    public WireNameAttribute(string name)
    {
        Name = name;
    }
}

/// <summary>Lookup between generated enums and their wire values.</summary>
public static class WireNames
{
    private sealed class Table
    {
        public readonly Dictionary<string, object> ByName = new();
        public readonly Dictionary<object, string> ByValue = new();
        public readonly List<string> Names = new();
    }

    private static readonly ConcurrentDictionary<Type, Table> Cache = new();

    private static Table Of(Type t) =>
        Cache.GetOrAdd(
            t,
            type =>
            {
                var table = new Table();
                foreach (var f in type.GetFields(BindingFlags.Public | BindingFlags.Static))
                {
                    var wire = f.GetCustomAttribute<WireNameAttribute>()?.Name ?? f.Name;
                    var v = f.GetValue(null)!;
                    table.ByName[wire] = v;
                    table.ByValue[v] = wire;
                    table.Names.Add(wire);
                }
                return table;
            }
        );

    /// <summary>The wire value of an enum member.</summary>
    public static string Of(Enum e) => Of(e.GetType()).ByValue.TryGetValue(e, out var s) ? s : e.ToString();

    /// <summary>The wire values of an enum, in declaration order.</summary>
    public static IReadOnlyList<string> Names<T>()
        where T : struct, Enum => Of(typeof(T)).Names;

    public static bool TryParse<T>(string s, out T value)
        where T : struct, Enum
    {
        if (Of(typeof(T)).ByName.TryGetValue(s, out var o))
        {
            value = (T)o;
            return true;
        }
        value = default;
        return false;
    }
}

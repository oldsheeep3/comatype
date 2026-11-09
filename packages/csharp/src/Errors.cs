using System;

namespace Comatype;

/// <summary>The parent of exceptions thrown by the runtime.</summary>
public class ComatypeException : Exception
{
    public ComatypeException(string message) : base(message) { }

    public ComatypeException(string message, Exception? inner) : base(message, inner) { }

    /// <summary>A status not declared in .comat was returned.</summary>
    public sealed class UnexpectedStatus : ComatypeException
    {
        public int Status { get; }
        public byte[] Body { get; }

        public UnexpectedStatus(int status, byte[] body) : base("想定していないステータス " + status + " が返りました")
        {
            Status = status;
            Body = body;
        }
    }

    /// <summary>A configuration error (a wrapper not passed, no base url, etc.).</summary>
    public sealed class Config : ComatypeException
    {
        public Config(string message) : base(message) { }
    }

    /// <summary>The request failed.</summary>
    public sealed class Transport : ComatypeException
    {
        public Transport(string message, Exception? inner) : base(message, inner) { }
    }
}

/// <summary>Input or output does not match a .comat type.</summary>
public class ValidationException : ComatypeException
{
    public string Path { get; }
    public string Reason { get; }

    public ValidationException(string path, string reason) : base(path.Length == 0 ? reason : path + ": " + reason)
    {
        Path = path;
        Reason = reason;
    }

    public static string Join(string path, string name) => path.Length == 0 ? name : path + "." + name;
}

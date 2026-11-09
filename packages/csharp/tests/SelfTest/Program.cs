// Unit tests of the C# runtime. A plain console program (no test library): `dotnet run --project packages/csharp/tests/SelfTest`
using Comatype;

var failed = 0;
var total = 0;

void Test(string name, Action body)
{
    total++;
    try
    {
        body();
    }
    catch (Exception e)
    {
        failed++;
        Console.Error.WriteLine("FAIL: " + name + ": " + e.Message);
    }
}

void Eq<T>(T want, T got)
{
    if (!EqualityComparer<T>.Default.Equals(want, got)) throw new Exception($"want {want}, got {got}");
}

void Throws<TEx>(Action f)
    where TEx : Exception
{
    try
    {
        f();
    }
    catch (TEx)
    {
        return;
    }
    throw new Exception("no " + typeof(TEx).Name);
}

string Reason(Action f)
{
    try
    {
        f();
    }
    catch (ValidationException e)
    {
        return e.Path + "|" + e.Reason;
    }
    return "";
}

Test("json round trip", () =>
{
    var tree = Json.Parse("{\"a\":[1,2.5,\"x\\n\\u0041\",true,null],\"b\":{}}");
    Eq("{\"a\":[1,2.5,\"x\\nA\",true,null],\"b\":{}}", Json.Stringify(tree));
});

Test("json errors", () =>
{
    Throws<ValidationException>(() => Json.Parse("{"));
    Throws<ValidationException>(() => Json.Parse("[1,]"));
    Throws<ValidationException>(() => Json.Parse("1 2"));
});

Test("json big integer becomes a double", () =>
{
    Eq("1E+20", Json.Parse("100000000000000000000")?.ToString()!.Replace("e", "E"));
});

Test("codec reads", () =>
{
    Eq(5L, Codec.ReadInteger(5L, "x"));
    Eq(3L, Codec.ReadInteger(3.0, "x"));
    Eq("x: 整数にしてください（文字列 でした）", Reason(() => Codec.ReadInteger("a", "x")).Replace("x|", "x: "));
    Eq(new DateOnly(2024, 2, 29), Codec.ReadDate("2024-02-29", "d"));
    Throws<ValidationException>(() => Codec.ReadDate("2024-2-9", "d"));
    Eq(new TimeOnly(1, 2, 3), Codec.ReadTime("01:02:03", "t"));
    Throws<ValidationException>(() => Codec.ReadTime("24:00:00", "t"));
    Eq(new DateTimeOffset(2024, 1, 2, 3, 4, 5, TimeSpan.Zero), Codec.ReadDatetime("2024-01-02T12:04:05+09:00", "t"));
    Throws<ValidationException>(() => Codec.ReadDatetime("2024-01-02 03:04:05", "t"));
    Eq(1.50m, Codec.ReadDecimal("1.50", "d"));
    Eq("1.50", Codec.FromDecimal(1.50m));
    Throws<ValidationException>(() => Codec.ReadDecimal("1e3", "d"));
    Eq(9007199254740993L, Codec.ReadInt64("9007199254740993", "i"));
    Throws<ValidationException>(() => Codec.ReadUrl("not a url", "u"));
    Eq(new byte[] { 1, 2, 3 }.Length, Codec.ReadBytes("AQID", "b").Length);
});

Test("datetime is written in UTC", () =>
{
    Eq("2024-01-02T03:04:05Z", Codec.FromDatetime(new DateTimeOffset(2024, 1, 2, 12, 4, 5, TimeSpan.FromHours(9))));
    Eq("2024-01-02T03:04:05.5Z", Codec.FromDatetime(new DateTimeOffset(2024, 1, 2, 3, 4, 5, 500, TimeSpan.Zero)));
});

Test("uuid versions", () =>
{
    var v4 = "3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10";
    Eq(Guid.Parse(v4), Codec.ReadUuidV4(v4, "u"));
    Throws<ValidationException>(() => Codec.ReadUuidV7(v4, "u"));
    Throws<ValidationException>(() => Codec.ReadUuid("zzz", "u"));
    Throws<ValidationException>(() => Codec.ReadUuidV4("3f2b8c1e-5d4a-4b6e-1c1d-2a7f0e8b9c10", "u")); // the variant is wrong
});

Test("email and phone", () =>
{
    new Email("a@b.co").Validate("e");
    Throws<ValidationException>(() => new Email("nope").Validate("e"));
    new Phone("+819012345678").Validate("p");
    Throws<ValidationException>(() => new Phone("09012345678").Validate("p"));
});

Test("check", () =>
{
    Check.Len("s", "abc", 1, 3);
    Throws<ValidationException>(() => Check.Len("s", "abcd", 1, 3));
    Check.Len("s", "😀😀", 1, 2); // code points
    Check.Range("n", 5, 0, 10);
    Throws<ValidationException>(() => Check.Range("n", 11, 0, 10));
    Check.Pattern("p", "abc123", "^[a-z]+\\d+$");
    Throws<ValidationException>(() => Check.Pattern("p", "ABC", "^[a-z]+$"));
    Check.OneOf("o", "a", "a", "b");
    Eq("o|a | b のどれかにしてください", Reason(() => Check.OneOf("o", "c", "a", "b")));
});

Test("wire strings", () =>
{
    Eq("true", Wire.Str(true));
    Eq("12", Wire.Str(12L));
    Eq("2024-01-02", Wire.Str(new DateOnly(2024, 1, 2)));
    Eq("+8190", Wire.Str(new Phone("+8190")));
    Eq("a, b", string.Join(", ", Wire.Strs(new List<string> { "a", "b" })));
    Eq(0, Wire.Strs(null).Count);
});

Test("wire reads", () =>
{
    Eq(7L, Wire.Read(new List<string> { "7" }, "n", false, Wire.ParseInteger));
    Eq("n|必須です", Reason(() => Wire.Read(new List<string>(), "n", false, Wire.ParseInteger)));
    Eq("n|整数ではありません", Reason(() => Wire.Read(new List<string> { "x" }, "n", false, Wire.ParseInteger)));
    Eq(null, Wire.ReadOptV(new List<string>(), "n", false, Wire.ParseInteger));
    var l = Wire.ReadList(new List<string> { "a, b ,c" }, "h", true, Wire.ParseString);
    Eq("a|b|c", string.Join("|", l));
    Eq(null, Wire.ReadListOpt(new List<string>(), "h", true, Wire.ParseString));
});

Test("wire path and query", () =>
{
    var raw = new RawRequest("get", "/user/:id/posts");
    Wire.FillPath(raw, "id", "a b/c");
    Eq("/user/a%20b%2Fc/posts", raw.Path);
    Wire.AddQuery(raw, "tag", new List<string> { "x", "y" }, "q", null);
    Eq(2, raw.Query.Count);
    Eq("a b/c", raw.Params["id"]);
});

Test("headers are case-insensitive", () =>
{
    var h = new Headers().Add("X-A", "1").Add("x-a", "2");
    Eq("1", h.Get("X-a")!);
    Eq(2, h.GetAll("X-A").Count);
    h.Set("X-A", "3");
    Eq(1, h.GetAll("x-a").Count);
});

Test("cookie serialize", () =>
{
    var def = new CookieDef("session", true, true, "lax", null, null, null);
    Eq("session=t; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax", Cookies.Serialize(def, CookieValue.Of("t").WithMaxAge(60)));
    Eq(
        "session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
        Cookies.Serialize(def, CookieValue.Clear())
    );
    Throws<ComatypeException>(() => Cookies.Serialize(def, CookieValue.Of("t").WithPath("/a;b")));
    Throws<ComatypeException>(() => Cookies.Serialize(null, CookieValue.Of("t")));
});

Test("cookie jar", () =>
{
    var jar = new CookieJar();
    jar.Store(new[] { "a=1; Path=/", "b=2; Path=/admin", "c=3; Path=/; Max-Age=60" });
    Eq("a,c", string.Join(",", jar.Get("/").Keys));
    Eq("a,b,c", string.Join(",", jar.Get("/admin/x").Keys));
    jar.Store(new[] { "a=; Path=/; Max-Age=0" });
    Eq("c", string.Join(",", jar.Get("/").Keys));
});

Test("response cache", () =>
{
    long now = 1000;
    var cache = new ResponseCache(2, () => now);
    var r = new RawResponse(200) { Body = new byte[] { 1 } };
    cache.Set("a", r, 100);
    Eq(1, cache.Get("a")!.Body.Length);
    now = 1101;
    Eq(null, cache.Get("a"));
    cache.Set("x", r, 100);
    cache.Set("y", r, 100);
    cache.Set("z", r, 100);
    Eq(2, cache.Size);
    Eq(null, cache.Get("x")); // the oldest is dropped
    Eq(true, ResponseCache.Cacheable(new RawResponse(204)));
    Eq(false, ResponseCache.Cacheable(new RawResponse(404)));
});

Test("cache cookie round trip", () =>
{
    var r = new RawResponse(200) { Body = System.Text.Encoding.UTF8.GetBytes("{\"ok\":true}") };
    r.Headers.Set("Content-Type", "application/json");
    var v = ResponseCache.EncodeCookie(r)!;
    var back = ResponseCache.DecodeCookie(v)!;
    Eq(200, back.Status);
    Eq("application/json", back.Headers.Get("content-type")!);
    Eq("{\"ok\":true}", System.Text.Encoding.UTF8.GetString(back.Body));
    Eq(true, ResponseCache.CookieName("k").StartsWith(ResponseCache.CookiePrefix));
});

Test("server routing", () =>
{
    var s = new S();
    var ep = Endpoint.Server<string, RawResponse>(
        "get",
        "/user/:id",
        "user/get__id",
        null,
        Array.Empty<string>(),
        false,
        null,
        raw => raw.Params["id"],
        res => res
    );
    s.Get(ep, id => RawResponse.Json(200, new Dictionary<string, object?> { ["id"] = id }));
    var r = s.HandleAsync("GET", "/user/abc%20d?x=1", new Headers(), Array.Empty<byte>()).GetAwaiter().GetResult();
    Eq(200, r.Status);
    Eq("{\"id\":\"abc d\"}", System.Text.Encoding.UTF8.GetString(r.Body));
    Eq(404, s.HandleAsync("GET", "/nope", new Headers(), Array.Empty<byte>()).GetAwaiter().GetResult().Status);
    var m = s.HandleAsync("POST", "/user/1", new Headers(), Array.Empty<byte>()).GetAwaiter().GetResult();
    Eq(405, m.Status);
    Eq("GET", m.Headers.Get("Allow")!);
    Throws<ArgumentException>(() => s.Get(ep, id => RawResponse.Json(200, (object?)null)));
});

Test("a handler fault is a 500 without details", () =>
{
    var errors = new List<string>();
    var s = new S().OnError(errors.Add);
    var ep = Endpoint.Server<NoArg, RawResponse>("get", "/boom", "boom", null, Array.Empty<string>(), false, null, _ => NoArg.Instance, res => res);
    s.Get(ep, (Func<NoArg, RawResponse>)(_ => throw new ComatypeException("secret detail")));
    var r = s.HandleAsync("GET", "/boom", new Headers(), Array.Empty<byte>()).GetAwaiter().GetResult();
    Eq(500, r.Status);
    Eq(false, System.Text.Encoding.UTF8.GetString(r.Body).Contains("secret"));
    Eq(1, errors.Count);
});

Console.WriteLine($"csharp runtime: {total - failed}/{total} passed");
return failed == 0 ? 0 : 1;

// Unit tests of the runtime (an executable so they run without XCTest / Swift Testing): swift run comatype-selftest
import Foundation
import Comatype

var failed = 0
func expect(_ ok: Bool, _ what: String, line: Int = #line) {
    if !ok {
        failed += 1
        FileHandle.standardError.write(Data("FAIL(\(line)): \(what)\n".utf8))
    }
}
func throwsError(_ f: () throws -> Void) -> Bool {
    do { try f() } catch { return true }
    return false
}

do {
    let j = try JSON.parse(Data(#"{"a":[1,2.5,"x\n",true,null],"b":{"c":"é"}}"#.utf8))
    expect(try JSON.parse(j.serialize()) == j, "JSON の往復")
    expect(throwsError { _ = try JSON.parse(Data("{".utf8)) }, "不正な JSON")
} catch { expect(false, "JSON: \(error)") }

expect(!throwsError { try Email("a@b.co").validate(path: "e") }, "email ok")
expect(throwsError { try Email("nope").validate(path: "e") }, "email ng")
expect(!throwsError { try Phone("+819012345678").validate(path: "p") }, "phone ok")
expect(throwsError { try Phone("0901").validate(path: "p") }, "phone ng")
expect(LocalDate.parse("2024-02-29") != nil, "うるう日")
expect(LocalDate.parse("2023-02-29") == nil, "うるう日でない")
expect(LocalTime.parse("24:00:00") == nil, "time ng")
expect(!throwsError { _ = try Codec.parseUuid("3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10", "u", 4) }, "uuidv4 ok")
expect(throwsError { _ = try Codec.parseUuid("3f2b8c1e-5d4a-7b6e-9c1d-2a7f0e8b9c10", "u", 4) }, "uuidv4 ng")
expect((try? Codec.int64(.string("9007199254740993"), "n")) == 9007199254740993, "int64")
expect(throwsError { _ = try Codec.int64(.int(5), "n") }, "int64 は文字列")
expect(!throwsError { _ = try Codec.parseDatetime("2024-01-02T03:04:05Z", "t") }, "datetime ok")
expect(throwsError { _ = try Codec.parseDatetime("2024-01-02 03:04:05", "t") }, "datetime ng")
expect(throwsError { try Check.len("s", "", 1, 5) }, "len")
expect(!throwsError { try Check.len("s", "abc", 1, 5) }, "len ok")
expect(throwsError { try Check.range("n", Double(200), 0, 150) }, "range")
expect(throwsError { try Check.oneOf("k", "x", ["a", "b"]) }, "oneOf")

let def = CookieDef(name: "session", httpOnly: true, secure: true, sameSite: "lax", path: nil, domain: nil, maxAge: nil)
expect((try? Cookies.serialize(def, CookieValue("v", maxAge: 3600))) == "session=v; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax", "Set-Cookie")
let jar = CookieJar()
jar.store(["session=v; Path=/; Max-Age=3600; HttpOnly"])
expect(jar.get("/x")["session"] == "v", "jar 保持")
jar.store(["session=; Path=/; Max-Age=0"])
expect(jar.get("/x")["session"] == nil, "jar 削除")

let sc = C.splitSetCookie("a=1; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT, b=2; Path=/x; Max-Age=0")
expect(sc.count == 2 && sc[0].hasPrefix("a=1") && sc[1].hasPrefix("b=2"), "Set-Cookie の分割: \(sc)")

// Cache
var clock = Date(timeIntervalSince1970: 1000)
let rc = ResponseCache(max: 2, now: { clock })
var one = RawResponse(status: 200)
one.body = Data("1".utf8)
rc.set("a", one, ttlMs: 100)
expect(rc.get("a") != nil, "cache hit")
clock = clock.addingTimeInterval(0.101)
expect(rc.get("a") == nil, "cache 期限切れ")
for k in ["a", "b", "c"] { rc.set(k, one, ttlMs: 1000) }
expect(rc.get("a") == nil && rc.get("c") != nil, "cache 上限")
var cr = RawResponse(status: 200)
cr.headers.add("X-A", "あ")
cr.body = Data(#"{"n":1}"#.utf8)
let cv = ResponseCache.encodeCookie(cr)
expect(cv != nil && cv!.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil, "cookie 値")
let back = cv.flatMap { ResponseCache.decodeCookie($0) }
expect(back?.status == 200 && back?.headers.get("x-a") == "あ" && back?.body == cr.body, "cookie 往復")
var big = RawResponse(status: 200)
big.body = Data(repeating: 120, count: 5000)
expect(ResponseCache.encodeCookie(big) == nil, "cookie 大きすぎる")
expect(ResponseCache.decodeCookie("!!!") == nil, "cookie 壊れた値")
var h1 = Headers(); h1.set("x-v", "1"); h1.set("authorization", "a")
var h2 = Headers(); h2.set("x-v", "1"); h2.set("authorization", "b")
expect(ResponseCache.clientKey("get", "u", Data(), ["X-V"], h1) == ResponseCache.clientKey("get", "u", Data(), ["X-V"], h2), "client キー")
expect(ResponseCache.serverKey("get", "/n", h1, Data()) != ResponseCache.serverKey("get", "/n", h2, Data()), "server キー")

if failed > 0 { exit(1) }
print("comatype-selftest: OK")

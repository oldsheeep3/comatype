package comatype;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Unit tests for the runtime (no external test library): scripts/test-java.sh */
public final class ComatypeTest {
    static int failed = 0;

    static void check(boolean ok, String what) {
        if (!ok) {
            failed++;
            System.err.println("FAIL: " + what);
        }
    }

    static boolean throwsValidation(Runnable r) {
        try {
            r.run();
            return false;
        } catch (ValidationException e) {
            return true;
        }
    }

    public static void main(String[] args) {
        Object j = Json.parse("{\"a\":[1,2.5,\"x\\n\",true,null],\"b\":{\"c\":\"é\"}}");
        check(Json.stringify(Json.parse(Json.stringify(j))).equals(Json.stringify(j)), "JSON の往復");
        check(throwsValidation(() -> Json.parse("{")), "不正な JSON");

        check(!throwsValidation(() -> new Email("a@b.co").validate("e")), "email ok");
        check(throwsValidation(() -> new Email("nope").validate("e")), "email ng");
        check(throwsValidation(() -> new Phone("0901").validate("p")), "phone ng");
        check(!throwsValidation(() -> Codec.parseUuid("3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10", "u", 4)), "uuidv4 ok");
        check(throwsValidation(() -> Codec.parseUuid("3f2b8c1e-5d4a-7b6e-9c1d-2a7f0e8b9c10", "u", 4)), "uuidv4 ng");
        check(throwsValidation(() -> Codec.parseDate("2023-02-29", "d")), "うるう日でない");
        check(!throwsValidation(() -> Codec.parseDate("2024-02-29", "d")), "うるう日");
        check(Codec.int64("9007199254740993", "n") == 9007199254740993L, "int64");
        check(throwsValidation(() -> Codec.int64(5L, "n")), "int64 は文字列");
        check(throwsValidation(() -> Check.len("s", "", 1L, 5L)), "len");
        check(throwsValidation(() -> Check.range("n", 200.0, 0L, 150L)), "range");
        check(throwsValidation(() -> Check.oneOf("k", "x", "a", "b")), "oneOf");

        CookieDef def = new CookieDef("session", true, true, "lax", null, null, null);
        check(Cookies.serialize(def, CookieValue.of("v").maxAge(3600)).equals("session=v; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax"), "Set-Cookie");
        CookieJar jar = new CookieJar();
        jar.store(List.of("session=v; Path=/; Max-Age=3600; HttpOnly"));
        check("v".equals(jar.get("/x").get("session")), "jar 保持");
        jar.store(List.of("session=; Path=/; Max-Age=0"));
        check(jar.get("/x").get("session") == null, "jar 削除");

        // Server routing: 404 / 405
        S s = new S();
        check(s.handle("GET", "/nope", new Headers(), new byte[0]).status == 404, "404");

        Map<String, Object> m = Codec.object(Json.parse("{\"k\":1}"), "");
        check(Codec.req(m, "k", "", Codec::integer) == 1L, "req");
        check(throwsValidation(() -> Codec.req(m, "x", "", Codec::integer)), "必須");
        UUID.randomUUID();

        // Cache: ttl and size limit, cookie encoding, keys
        long[] clock = {1000};
        ResponseCache rc = new ResponseCache(2, () -> clock[0]);
        RawResponse one = new RawResponse(200);
        one.body = "1".getBytes();
        rc.set("a", one, 100);
        check(rc.get("a") != null && new String(rc.get("a").body).equals("1"), "cache hit");
        clock[0] += 101;
        check(rc.get("a") == null, "cache 期限切れ");
        rc.set("a", one, 1000);
        rc.set("b", one, 1000);
        rc.set("c", one, 1000);
        check(rc.get("a") == null && rc.get("c") != null, "cache 上限");
        RawResponse cr = new RawResponse(200);
        cr.headers.add("X-A", "あ");
        cr.body = "{\"n\":1}".getBytes();
        String cv = ResponseCache.encodeCookie(cr);
        check(cv != null && cv.matches("[A-Za-z0-9_-]+"), "cookie 値");
        RawResponse back = ResponseCache.decodeCookie(cv);
        check(back != null && back.status == 200 && "あ".equals(back.headers.get("x-a")) && new String(back.body).equals("{\"n\":1}"), "cookie 往復");
        RawResponse big = new RawResponse(200);
        big.body = new byte[5000];
        check(ResponseCache.encodeCookie(big) == null, "cookie 大きすぎる");
        check(ResponseCache.decodeCookie("!!!") == null, "cookie 壊れた値");
        Headers h1 = new Headers().set("x-v", "1").set("authorization", "a");
        Headers h2 = new Headers().set("x-v", "1").set("authorization", "b");
        check(ResponseCache.clientKey("get", "u", new byte[0], List.of("X-V"), h1).equals(ResponseCache.clientKey("get", "u", new byte[0], List.of("X-V"), h2)), "client キーは宣言したヘッダだけ");
        check(!ResponseCache.serverKey("get", "/n", h1, new byte[0]).equals(ResponseCache.serverKey("get", "/n", h2, new byte[0])), "server キーは全ヘッダ");

        if (failed > 0) System.exit(1);
        System.out.println("java runtime tests: OK");
    }
}

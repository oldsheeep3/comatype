from comatype.cache import (
    CACHE_COOKIE_PREFIX,
    CacheSpec,
    MemoryCache,
    cache_cookie_name,
    client_cache_key,
    decode_cache_cookie,
    encode_cache_cookie,
    server_cache_key,
)
from comatype.raw import Headers, RawResponse


def test_memory_cache_ttl_and_limit() -> None:
    now = [1000.0]
    c = MemoryCache(2, lambda: now[0])
    c.set("a", RawResponse(status=200, body=b"1"), 100)
    hit = c.get("a")
    assert hit is not None and hit.body == b"1"
    now[0] += 0.101
    assert c.get("a") is None
    for k in "abc":
        c.set(k, RawResponse(status=200), 1000)
    assert c.get("a") is None and c.get("c") is not None


def test_cookie_roundtrip() -> None:
    r = RawResponse(status=200, headers=Headers({"x-a": "あ"}), body='{"n":1}'.encode())
    v = encode_cache_cookie(r)
    assert v is not None and not set(v) & set("=;, ")
    got = decode_cache_cookie(v)
    assert got is not None and got.status == 200 and got.headers["x-a"] == "あ" and got.body == b'{"n":1}'
    assert encode_cache_cookie(RawResponse(status=200, body=b"x" * 5000)) is None
    assert decode_cache_cookie("!!!") is None
    assert cache_cookie_name("k").startswith(CACHE_COOKIE_PREFIX) and len(cache_cookie_name("k")) == len(CACHE_COOKIE_PREFIX) + 16


def test_keys() -> None:
    a = client_cache_key("get", "u", b"", ("X-V",), {"x-v": "1", "authorization": "a"})
    b = client_cache_key("get", "u", b"", ("X-V",), {"x-v": "1", "authorization": "b"})
    assert a == b
    assert server_cache_key("get", "/n", {"a": "1"}, b"") != server_cache_key("get", "/n", {"a": "2"}, b"")
    assert CacheSpec("memory", 10).memory and not CacheSpec("off").memory and CacheSpec("cookie", 10).cookie

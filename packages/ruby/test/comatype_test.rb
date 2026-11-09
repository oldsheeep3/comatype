# frozen_string_literal: true

require "minitest/autorun"
require "comatype"

class ComatypeTest < Minitest::Test
  include Comatype

  class Role < Enum
    values "admin", "member"
  end

  class User < Model
    field :name, "name", [:string, { min: 1, max: 5 }]
    field :role, "role", [:ref, Role]
    field :age, "age", [:int, { min: 0, max: 150 }], optional: true
    field :id64, "id64", :int64
    field :tags, "tags", %i[array string]
    field :deleted_at, "deletedAt", %i[nullable datetime]
  end

  def valid
    { "name" => "taro", "role" => "admin", "id64" => "9007199254740993", "tags" => ["a"], "deletedAt" => nil }
  end

  def test_decode_encode_roundtrip
    u = User.decode(valid)
    assert_equal 9_007_199_254_740_993, u.id64
    assert_equal valid, u.encode
  end

  def test_required_and_types
    e = assert_raises(ValidationError) { User.decode(valid.reject { |k, _| k == "name" }) }
    assert_equal "name", e.path
    assert_raises(ValidationError) { User.decode(valid.merge("id64" => 5)) }
    assert_raises(ValidationError) { User.decode(valid.merge("role" => "root")) }
    assert_raises(ValidationError) { User.decode(valid.merge("name" => "toolong")) }
    assert_raises(ValidationError) { User.decode(valid.merge("age" => 200)) }
  end

  def test_scalars
    assert_raises(ValidationError) { Codec.decode(:email, "nope") }
    assert_raises(ValidationError) { Codec.decode(:uuidv4, "3f2b8c1e-5d4a-7b6e-9c1d-2a7f0e8b9c10") }
    assert_raises(ValidationError) { Codec.decode(:date, "2023-02-29") }
    assert_equal Date.new(2024, 2, 29), Codec.decode(:date, "2024-02-29")
    assert_equal BigDecimal("1.5"), Codec.decode(:decimal, "1.5")
  end

  def test_cookie
    d = CookieDef.new(name: "session", http_only: true, secure: true, same_site: "lax")
    s = Cookies.serialize(d, CookieValue.new(value: "v", max_age: 3600))
    assert_equal "session=v; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax", s
    jar = CookieJar.new
    jar.store(["session=v; Path=/; Max-Age=3600"])
    assert_equal "v", jar.get("/x")["session"]
    jar.store(["session=; Path=/; Max-Age=0"])
    assert_nil jar.get("/x")["session"]
  end

  def test_cache
    now = [100.0]
    c = ResponseCache.new(2, clock: -> { now[0] })
    one = RawResponse.new(200)
    one.body = "1".b
    c.set("a", one, 100)
    assert_equal "1", c.get("a").body
    now[0] += 0.101
    assert_nil c.get("a")
    %w[a b c].each { |k| c.set(k, one, 1000) }
    assert_nil c.get("a")
    refute_nil c.get("c")
  end

  def test_cache_cookie_and_keys
    r = RawResponse.new(200)
    r.headers.add("X-A", "あ")
    r.body = '{"n":1}'.b
    v = ResponseCache.encode_cookie(r)
    assert_match(/\A[A-Za-z0-9_-]+\z/, v)
    back = ResponseCache.decode_cookie(v)
    assert_equal [200, "あ", '{"n":1}'], [back.status, back.headers["x-a"], back.body]
    big = RawResponse.new(200)
    big.body = "x" * 5000
    assert_nil ResponseCache.encode_cookie(big)
    assert_nil ResponseCache.decode_cookie("!!!")
    h1 = Headers.new
    h1["x-v"] = "1"
    h1["authorization"] = "a"
    h2 = Headers.new
    h2["x-v"] = "1"
    h2["authorization"] = "b"
    assert_equal ResponseCache.client_key("get", "u", "", ["X-V"], h1), ResponseCache.client_key("get", "u", "", ["X-V"], h2)
    refute_equal ResponseCache.server_key("get", "/n", h1, ""), ResponseCache.server_key("get", "/n", h2, "")
  end

  def test_server_routing
    s = S.new
    assert_equal 404, s.handle("GET", "/nope", Headers.new, "").status
  end
end

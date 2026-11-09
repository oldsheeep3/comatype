# frozen_string_literal: true

module Comatype
  # The `cookie <name> { ... }` of init.comat.
  CookieDef = Struct.new(:name, :http_only, :secure, :same_site, :path, :domain, :max_age, keyword_init: true)

  # A cookie to issue.
  CookieValue = Struct.new(:value, :delete, :max_age, :path, :domain, keyword_init: true)

  module Cookies
    EPOCH = "Thu, 01 Jan 1970 00:00:00 GMT"

    module_function

    def encode(s)
      URI.encode_www_form_component(s.to_s).gsub("+", "%20")
    end

    def decode(s)
      URI.decode_www_form_component(s.gsub("+", "%2B"))
    rescue ArgumentError
      s
    end

    def attr(what, v)
      raise ConfigError, "cookie の #{what} に使えない文字があります: #{v.inspect}" if v.to_s.match?(/[;\r\n]/)

      v
    end

    # Build a Set-Cookie value. Attributes (HttpOnly etc.) come from init.comat.
    def serialize(defn, v)
      raise ConfigError, "このエンドポイントは cookie を発行できません（cookie off、または init.comat に cookie の宣言がありません）" if defn.nil?

      parts = ["#{defn.name}=#{encode(v.delete ? '' : v.value)}"]
      parts << "Path=#{attr('path', v.path || defn.path || '/')}"
      d = v.domain || defn.domain
      parts << "Domain=#{attr('domain', d)}" if d
      if v.delete
        parts << "Max-Age=0" << "Expires=#{EPOCH}"
      else
        m = v.max_age || defn.max_age
        if m
          raise ConfigError, "cookie の maxAge が不正です: #{m}" if m.negative?

          parts << "Max-Age=#{m}"
        end
      end
      parts << "HttpOnly" if defn.http_only
      parts << "Secure" if defn.secure
      parts << "SameSite=#{defn.same_site.capitalize}" if defn.same_site
      parts.join("; ")
    end
  end

  # A jar for HTTP clients that do not keep cookies themselves.
  # Assuming the API is a single origin, Domain is ignored and only Path and expiry are checked.
  class CookieJar
    Stored = Struct.new(:value, :path, :expires)

    def initialize
      @m = {}
      @lock = Mutex.new
    end

    # Cookies to send for this path (name -> value).
    def get(path)
      @lock.synchronize do
        now = Time.now
        @m.delete_if { |_, c| c.expires && c.expires <= now }
        @m.each_with_object({}) do |(k, c), out|
          prefix = c.path.end_with?("/") ? c.path : "#{c.path}/"
          out[k] = c.value if c.path == "/" || path == c.path || path.start_with?(prefix)
        end
      end
    end

    # Take in the response's Set-Cookie (Max-Age=0 deletes).
    def store(lines)
      @lock.synchronize do
        lines.each do |line|
          segs = line.split(";").map(&:strip)
          name, value = segs.shift.to_s.split("=", 2)
          next if name.nil? || name.empty? || value.nil?

          c = Stored.new(Cookies.decode(value), "/", nil)
          max_age = nil
          segs.each do |a|
            k, v = a.split("=", 2)
            case k.downcase
            when "path" then c.path = v if v&.start_with?("/")
            when "max-age" then max_age = Integer(v, exception: false)
            end
          end
          if max_age && max_age <= 0
            @m.delete(name)
          else
            c.expires = Time.now + max_age if max_age
            @m[name] = c
          end
        end
      end
    end

    def clear
      @lock.synchronize { @m.clear }
    end
  end
end

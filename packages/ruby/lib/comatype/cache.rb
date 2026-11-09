# frozen_string_literal: true

module Comatype
  # The `cache` setting of `.comat` (GET / QUERY endpoints only).
  # mode is :off (never cache) / :memory (in memory for the ttl) / :cookie (in a cookie for the ttl; client only)
  CacheSpec = Struct.new(:mode, :ttl_ms) do
    def memory?
      mode == :memory && ttl_ms.to_i.positive?
    end

    def cookie?
      mode == :cookie && ttl_ms.to_i.positive?
    end
  end

  # Cache: the in-memory TTL cache, and key / cookie encoding.
  class ResponseCache
    # Name prefix of cache cookies. The client does not send cookies with this prefix back to the server
    COOKIE_PREFIX = "comatype_cache_"
    # Maximum value length of one cookie. Larger responses are not cached in a cookie
    COOKIE_MAX = 3800

    def initialize(max = 1000, clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) })
      @max = max
      @clock = clock
      @map = {}
      @lock = Mutex.new
    end

    # In-memory cache with ttl (expired entries are dropped on lookup; over the size limit, the oldest are dropped)
    def get(key)
      @lock.synchronize do
        e = @map[key]
        return nil unless e

        if e[1] <= @clock.call
          @map.delete(key)
          return nil
        end
        self.class.copy(e[0])
      end
    end

    def set(key, res, ttl_ms)
      @lock.synchronize do
        @map.delete(key)
        @map[key] = [self.class.copy(res), @clock.call + (ttl_ms / 1000.0)]
        @map.shift while @map.size > @max
      end
    end

    def clear
      @lock.synchronize { @map.clear }
    end

    def size
      @lock.synchronize { @map.size }
    end

    class << self
      def copy(r)
        o = RawResponse.new(r.status)
        r.headers.each { |k, v| o.headers.add(k, v) }
        o.body = r.body.dup
        o
      end

      # Whether a response may be cached (2xx, without Set-Cookie)
      def cacheable?(r)
        r.status.between?(200, 299) && r.set_cookies.empty?
      end

      # Client cache key: method, URL (path and query) and body, plus the request headers declared in `.comat`.
      # Headers added by wrappers or init (Authorization etc.) are not included.
      def client_key(method, url, body, declared, headers)
        hs = declared.map(&:downcase).sort.map { |n| "#{n}:#{headers[n]}" }.join("\n")
        "#{method}\n#{url}\n#{hs}\n\n#{body.dup.force_encoding('UTF-8')}"
      end

      # Server cache key: an exact match of the request (method, path, query, all headers, body)
      def server_key(method, target, headers, body)
        hs = headers.map { |k, v| "#{k.downcase}:#{v}" }.sort.join("\n")
        "#{method}\n#{target}\n#{hs}\n\n#{body.dup.force_encoding('UTF-8')}"
      end

      # Derive a cookie name from the key (FNV-1a 64-bit)
      def cookie_name(key)
        h = 0xcbf29ce484222325
        key.each_byte { |b| h = ((h ^ b) * 0x100000001b3) & 0xffffffffffffffff }
        format("%s%016x", COOKIE_PREFIX, h)
      end

      # Turn a response into a cookie value (base64url of `status\nname\tvalue\n...\n\nbody`). nil if too large
      def encode_cookie(r)
        head = +"#{r.status}\n"
        r.headers.each { |k, v| head << "#{k}\t#{v}\n" }
        v = Base64.urlsafe_encode64(head.b + "\n".b + r.body.b, padding: false)
        v.length <= COOKIE_MAX ? v : nil
      end

      def decode_cookie(value)
        raw = Base64.urlsafe_decode64(value).b
        head, sep, body = raw.partition("\n\n".b)
        return nil if sep.empty?

        lines = head.force_encoding("UTF-8").split("\n")
        out = RawResponse.new(Integer(lines[0]))
        lines[1..].each do |l|
          k, tab, v = l.partition("\t")
          out.headers.add(k, v) unless tab.empty?
        end
        out.body = body
        out
      rescue ArgumentError
        nil
      end
    end
  end
end

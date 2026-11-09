# frozen_string_literal: true

module Comatype
  # Client. Called like `C.put(ENDPOINT, params: {id: id}, body: user)`.
  # Argument keys are params: search: headers: body: (a Model instance or a hash keyed by attr).
  module C
    Config = Struct.new(:base_url, :wrappers, :cookie_jar, :headers, :timeout, keyword_init: true)

    @lock = Mutex.new
    # responses of `cache <ttl>` (memory) endpoints
    @cache = ResponseCache.new
    # names of cookies carrying cached responses (for clear_cache)
    @cache_cookies = []
    @config = Config.new(wrappers: {}, headers: {}, timeout: 30)

    class << self
      # Call once at startup.
      #   base_url:  precedence: this > env COMATYPE_BASE_URL > baseUrl in init.comat
      #   wrappers:  e.g. the generated Init.wrappers(auth: ...). An endpoint that uses a missing wrapper raises an error
      #   cookies:   true or a CookieJar. `cookie on` endpoints keep Set-Cookie and send it back
      def init(wrappers: {}, base_url: nil, cookies: nil, headers: {}, timeout: 30)
        jar = cookies == true ? CookieJar.new : cookies
        @lock.synchronize do
          @config = Config.new(base_url: base_url, wrappers: wrappers.transform_keys(&:to_s), cookie_jar: jar, headers: headers,
                               timeout: timeout)
        end
      end

      # Drop the cache (memory and what is stored in the cookie jar), e.g. on logout.
      def clear_cache
        @cache.clear
        jar = @lock.synchronize { @config.cookie_jar }
        @cache_cookies.each { |name| jar&.store(["#{name}=; Path=/; Max-Age=0"]) }
        @cache_cookies.clear
      end

      %w[get post put patch delete options query head].each do |m|
        define_method(m) { |ep, **args| call(m, ep, args) }
      end

      private

      def call(method, ep, args)
        raise ConfigError, "C.#{method} に #{ep.method} のエンドポイント（#{ep.module_name}）は渡せません" unless ep.method == method

        conf = @lock.synchronize { @config }
        chain = ep.wraps.map do |name|
          conf.wrappers[name] or raise ConfigError, "ラッパー #{name} が init に渡されていません（#{ep.module_name}）"
        end
        raw = ep.build_request(args)
        conf.headers.each { |k, v| raw.headers[k.to_s] = v unless raw.headers.key?(k.to_s) }
        raw.headers["Accept"] = "application/json" unless raw.headers.key?("Accept")
        if ep.cookie && conf.cookie_jar
          # Cache cookies are not sent back to the server
          conf.cookie_jar.get(raw.path).each { |k, v| raw.cookies[k] = v unless k.start_with?(ResponseCache::COOKIE_PREFIX) }
        end

        send_fn = ->(r) { transport(ep, conf, r) }
        nxt = chain.reverse.reduce(send_fn) do |inner, w|
          ->(r) { w.call(r, inner) }
        end
        resp = nxt.call(raw)
        raise ConfigError, "ラッパーが nil のレスポンスを返しました（#{ep.module_name}）" unless resp.is_a?(RawResponse)

        ep.parse_response(resp)
      end

      def transport(ep, conf, r)
        base = conf.base_url || ENV["COMATYPE_BASE_URL"]
        base = ep.base_url if base.nil? || base.empty?
        if base.nil? || base.empty?
          raise ConfigError, "base url がありません（init の base_url、環境変数 COMATYPE_BASE_URL、init.comat の baseUrl のどれかで指定してください）"
        end

        url = base.sub(%r{/+\z}, "") + r.path
        unless r.query.empty?
          url += "?" + r.query.map { |k, v| "#{Cookies.encode(k)}=#{Cookies.encode(v)}" }.join("&")
        end
        uri = URI.parse(url)
        # Cache (GET / QUERY): memory or cookie. The key is the method, URL, body and the declared request headers
        spec = ep.cache
        cache_key = nil
        if spec && (spec.memory? || (spec.cookie? && conf.cookie_jar))
          cache_key = ResponseCache.client_key(r.method, url, r.body, ep.cache_headers, r.headers)
          hit =
            if spec.memory?
              @cache.get(cache_key)
            elsif (v = conf.cookie_jar.get("/")[ResponseCache.cookie_name(cache_key)])
              ResponseCache.decode_cookie(v)
            end
          return hit if hit
        end
        req = Net::HTTPGenericRequest.new(r.method.upcase, !r.body.empty?, true, uri.request_uri)
        r.headers.each { |k, v| req.add_field(k, v) }
        unless r.cookies.empty? || r.headers.key?("Cookie")
          req["Cookie"] = r.cookies.sort.map { |k, v| "#{k}=#{Cookies.encode(v)}" }.join("; ")
        end
        req.body = r.body unless r.body.empty?
        res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: conf.timeout, read_timeout: conf.timeout) { |h| h.request(req) }
        out = RawResponse.new(res.code.to_i)
        res.each_header { |k, _| res.get_fields(k).each { |v| out.headers.add(k, v) } unless k.casecmp?("set-cookie") }
        out.body = (res.body || "").b
        out.set_cookies = res.get_fields("set-cookie") || []
        conf.cookie_jar.store(out.set_cookies) if ep.cookie && conf.cookie_jar && !out.set_cookies.empty?
        if cache_key && ResponseCache.cacheable?(out)
          if spec.memory?
            @cache.set(cache_key, out, spec.ttl_ms)
          elsif (v = ResponseCache.encode_cookie(out))
            name = ResponseCache.cookie_name(cache_key)
            # cookie ttl is in seconds (rounded up)
            conf.cookie_jar.store(["#{name}=#{v}; Path=/; Max-Age=#{[1, (spec.ttl_ms / 1000.0).ceil].max}"])
            @cache_cookies << name
          end
        end
        out
      rescue SystemCallError, IOError, Timeout::Error, SocketError => e
        raise TransportError, e.message
      end
    end
  end
end

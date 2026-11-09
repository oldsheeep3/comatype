# frozen_string_literal: true

module Comatype
  # Server. Register handlers on an `S` instance and run it with `call(env)` (Rack compatible), `handle` (for any framework),
  # or `serve` (a simple server using only the standard library).
  #
  #   s = Comatype::S.new
  #   s.init(Init.wrappers(auth: auth))
  #   s.put(UserPutId::ENDPOINT) { |req| UserPutId::S200.new(user) }
  #   run s                 # config.ru
  class S
    Route = Struct.new(:method, :module_name, :segs, :statics, :wraps, :cache, :handle)

    def initialize
      @routes = []
      @wrappers = {}
      @on_error = ->(msg) { warn("[comatype] #{msg}") }
      @lock = Mutex.new
      # responses of `cache <ttl>` (memory) endpoints. Hits on an exact request match
      @cache = ResponseCache.new
    end

    # Call once at startup. A wrapper is `->(req, nxt) { ...; nxt.call(req) }` (req is a RawRequest; ctx is req.ctx[:name]).
    # Requests to an endpoint that uses a missing wrapper get a 500.
    def init(wrappers = {})
      @wrappers = wrappers.transform_keys(&:to_s)
      self
    end

    # Receiver of handler exceptions and causes of responses that do not match .comat. Defaults to stderr
    def on_error(&block)
      @on_error = block
      self
    end

    %w[get post put patch delete options query head].each do |m|
      define_method(m) { |ep, &h| register(m, ep, h) }
    end

    # Handle one request. target is `/path?query`; headers is Comatype::Headers. Returns a RawResponse.
    def handle(method, target, headers, body)
      method = method.downcase
      path, _, query = target.partition("?")
      segs = []
      path.split("/").reject(&:empty?).each do |s|
        d = Wire.percent_decode(s)
        return json_error(400, "bad_request", "path が不正です") if d.nil?

        segs << d
      end
      route, params = find(method, segs)
      if route.nil?
        allow = @routes.map(&:method).uniq.select { |m| find(m, segs).first }.map(&:upcase).sort
        unless allow.empty?
          r = json_error(405, "method_not_allowed", "使えるメソッド: #{allow.join(', ')}")
          r.headers["Allow"] = allow.join(", ")
          return r
        end
        return json_error(404, "not_found", path)
      end

      raw = RawRequest.new(method, path)
      raw.query = Wire.parse_query(query)
      raw.params = params
      raw.body = body.b
      headers.get_all("Cookie").each do |c|
        c.split(";").each do |pair|
          k, v = pair.strip.split("=", 2)
          raw.cookies[k] ||= Cookies.decode(v) if k && !k.empty? && v
        end
      end
      raw.headers = headers

      # Cache (GET / QUERY, memory only; cookie caching is client-only). Looked up before the wrappers, so the key includes all headers (auth too)
      cache_key = nil
      if route.cache&.memory?
        cache_key = ResponseCache.server_key(method, target, headers, body)
        hit = @cache.get(cache_key)
        return hit if hit
      end

      chain = route.wraps.map do |name|
        @wrappers[name] or begin
          @on_error.call("ラッパー #{name} が init に渡されていません（#{route.module_name}）")
          return RawResponse.error("wrapper missing")
        end
      end
      resp =
        begin
          nxt = chain.reverse.reduce(route.handle) { |inner, w| ->(r) { w.call(r, inner) } }
          nxt.call(raw)
        rescue StandardError => e
          RawResponse.error("#{route.module_name}: #{e.class}: #{e.message}")
        end
      if resp.err
        @on_error.call("#{route.module_name}: #{resp.err}")
      elsif cache_key && ResponseCache.cacheable?(resp)
        @cache.set(cache_key, resp, route.cache.ttl_ms)
      end
      resp
    end

    # Rack compatible
    def call(env)
      headers = Headers.new
      env.each do |k, v|
        if k.start_with?("HTTP_")
          headers.add(k[5..].split("_").map(&:capitalize).join("-"), v)
        elsif %w[CONTENT_TYPE CONTENT_LENGTH].include?(k)
          headers.add(k.split("_").map(&:capitalize).join("-"), v)
        end
      end
      body = env["rack.input"] ? env["rack.input"].read.to_s : ""
      target = env["PATH_INFO"].to_s + (env["QUERY_STRING"].to_s.empty? ? "" : "?#{env['QUERY_STRING']}")
      r = handle(env["REQUEST_METHOD"], target, headers, body)
      rack_headers = {}
      r.headers.each { |k, v| rack_headers[k] = rack_headers.key?(k) ? "#{rack_headers[k]}\n#{v}" : v }
      rack_headers["set-cookie"] = r.set_cookies.join("\n") unless r.set_cookies.empty?
      no_body = [204, 205, 304].include?(r.status) || env["REQUEST_METHOD"].to_s.casecmp?("HEAD")
      [r.status, rack_headers, no_body ? [] : [r.body]]
    end

    # Simple server using only the standard library (a thread per connection). Port 0 picks a free port. Returns {TCPServer, Thread}.
    def serve(host: "127.0.0.1", port: 0)
      server = TCPServer.new(host, port)
      thread = Thread.new do
        loop do
          sock = server.accept
          Thread.new(sock) { |s| connection(s) }
        rescue IOError, SystemCallError
          break
        end
      end
      [server, thread]
    end

    private

    def register(method, ep, handler)
      raise ArgumentError, "S##{method} に #{ep.method} のエンドポイント（#{ep.module_name}）は渡せません" unless ep.method == method
      raise ArgumentError, "ハンドラ（ブロック）がありません" unless handler

      segs = ep.path.split("/").reject(&:empty?)
      route = Route.new(method, ep.module_name, segs, segs.count { |s| !s.start_with?(":") }, ep.wraps, ep.cache, nil)
      route.handle = lambda do |raw|
        req =
          begin
            ep.parse_request(raw)
          rescue ValidationError => e
            body = { "code" => "validation_error", "message" => e.message }
            body["path"] = e.path unless e.path.empty?
            return RawResponse.json(400, body)
          end
        res = handler.call(req)
        ep.build_response(res)
      rescue ConfigError, ValidationError, ArgumentError, NoMethodError, TypeError => e
        RawResponse.error("#{e.class}: #{e.message}")
      end
      @lock.synchronize do
        shape = ->(r) { "#{r.method} /" + r.segs.map { |s| s.start_with?(":") ? ":" : s }.join("/") }
        if (o = @routes.find { |x| shape.call(x) == shape.call(route) })
          raise ArgumentError, "#{shape.call(route)} が重複しています（#{o.module_name} と #{route.module_name}）"
        end

        @routes << route
      end
      self
    end

    # Route matching the path (more static segments win)
    def find(method, segs)
      best = nil
      best_params = nil
      @routes.each do |r|
        next unless r.method == method && r.segs.size == segs.size

        params = {}
        ok = r.segs.zip(segs).all? do |want, got|
          if want.start_with?(":")
            params[want[1..]] = got
            true
          else
            want == got
          end
        end
        if ok && (best.nil? || r.statics > best.statics)
          best = r
          best_params = params
        end
      end
      [best, best_params]
    end

    def json_error(status, code, message)
      RawResponse.json(status, { "code" => code, "message" => message })
    end

    REASONS = { 200 => "OK", 201 => "Created", 204 => "No Content", 400 => "Bad Request", 401 => "Unauthorized", 403 => "Forbidden",
                404 => "Not Found", 405 => "Method Not Allowed", 409 => "Conflict", 422 => "Unprocessable Entity", 500 => "Internal Server Error" }.freeze

    def connection(sock)
      line = sock.gets or return
      method, target, = line.split(" ")
      return unless method && target

      headers = Headers.new
      while (l = sock.gets) && !l.strip.empty?
        k, v = l.split(":", 2)
        headers.add(k.strip, v.to_s.strip) if v
      end
      body = +""
      if headers["Transfer-Encoding"].to_s.casecmp?("chunked")
        while (sz = sock.gets.to_s.strip.split(";").first.to_i(16)).positive?
          body << sock.read(sz)
          sock.gets
        end
      elsif (n = headers["Content-Length"].to_i).positive?
        body = sock.read(n)
      end
      r = handle(method, target, headers, body)
      no_body = [204, 205, 304].include?(r.status) || method.casecmp?("HEAD")
      head = +"HTTP/1.1 #{r.status} #{REASONS.fetch(r.status, 'Status')}\r\n"
      r.headers.each { |k, v| head << "#{k}: #{v}\r\n" unless k.casecmp?("content-length") }
      r.set_cookies.each { |c| head << "Set-Cookie: #{c}\r\n" }
      head << "Content-Length: #{no_body ? 0 : r.body.bytesize}\r\nConnection: close\r\n\r\n"
      sock.write(head.b)
      sock.write(r.body) unless no_body
    rescue IOError, SystemCallError
      nil
    ensure
      sock.close unless sock.closed?
    end
  end
end

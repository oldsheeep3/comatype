# frozen_string_literal: true

module Comatype
  # The request a server handler receives.
  Request = Struct.new(:params, :search, :headers, :body, :ctx, :raw, keyword_init: true)

  # Endpoint descriptor (held by generated code). Request / response conversion is done here according to the description.
  class Endpoint
    attr_reader :method, :path, :module_name, :base_url, :wraps, :cookie, :cookie_def, :cache, :cache_headers, :params, :search, :headers, :body, :responses

    # params / search / headers: Model subclasses (nil if absent), body: type description (nil if absent)
    # responses: array of Response subclasses
    def initialize(method:, path:, module_name:, base_url: nil, wraps: [], cookie: false, cookie_def: nil, cache: nil, cache_headers: [],
                   params: nil, search: nil, headers: nil, body: nil, responses: [])
      @method = method
      @path = path
      @module_name = module_name
      @base_url = base_url
      @wraps = wraps.map(&:to_s)
      @cookie = cookie
      @cookie_def = cookie_def
      @cache = cache # CacheSpec (GET / QUERY only; nil means no caching)
      @cache_headers = cache_headers # names of declared request headers included in the client cache key
      @params = params
      @search = search
      @headers = headers
      @body = body
      @responses = responses.to_h { |r| [r.status, r] }
    end

    # ---- client: arguments (params: search: headers: body:) -> RawRequest ----

    def build_request(args)
      unknown = args.keys - %i[params search headers body]
      raise ArgumentError, "#{module_name}: 知らない引数 #{unknown.join(', ')}" unless unknown.empty?

      raw = RawRequest.new(method, path)
      if @params
        p = @params.coerce(args[:params]) || @params.new
        p.validate
        segs = raw.path.split("/", -1).map do |s|
          next s unless s.start_with?(":")

          name = s[1..]
          f = @params.fields.find { |x| x.json == name }
          v = f && Codec.to_wire_list(f.type, p.public_send(f.attr)).first
          raise ValidationError.new(name, "必須です") if v.nil? || v.empty?

          raw.params[name] = v
          Cookies.encode(v)
        end
        raw.path = segs.join("/")
      end
      if @search
        s = @search.coerce(args[:search]) || @search.new
        s.validate
        @search.fields.each { |f| Codec.to_wire_list(f.type, s.public_send(f.attr)).each { |v| raw.query << [f.json, v] } }
      end
      if @headers
        h = @headers.coerce(args[:headers]) || @headers.new
        h.validate
        write_headers(raw.headers, @headers, h)
      end
      if @body
        raise ValidationError.new("body", "必須です") if args[:body].nil?

        b = args[:body]
        b = b.is_a?(Model) ? b : coerce_body(@body, b)
        Codec.validate(@body, b, "")
        raw.body = JSON.generate(Codec.encode(@body, b)).b
        raw.headers["Content-Type"] = "application/json"
      end
      raw
    end

    # ---- client: RawResponse -> Response ----

    def parse_response(raw)
      cls = @responses[raw.status] or raise UnexpectedStatusError.new(raw.status, raw.body)
      body = nil
      if cls.body_type
        raise ValidationError.new("body", "必須です") if raw.body.empty?

        body = Codec.decode(cls.body_type, Wire.parse_json(raw.body, "body"), "body")
      end
      headers = nil
      if cls.headers_class
        headers = cls.headers_class.from_wire(->(n) { raw.headers.get_all(n) }, split: true)
        headers.validate
      end
      cls.new(body, headers: headers)
    end

    # ---- server: RawRequest -> Request ----

    def parse_request(raw)
      req = Request.new(ctx: raw.ctx, raw: raw)
      req.params = @params&.from_wire(->(n) { raw.params.key?(n) ? [raw.params[n]] : [] })&.tap(&:validate)
      req.search = @search&.from_wire(->(n) { raw.query_all(n) })&.tap(&:validate)
      req.headers = @headers&.from_wire(->(n) { raw.headers.get_all(n) }, split: true)&.tap(&:validate)
      if @body
        raise ValidationError.new("body", "必須です") if raw.body.empty?

        req.body = Codec.decode(@body, Wire.parse_json(raw.body, "body"), "body")
      end
      req
    end

    # ---- server: Response -> RawResponse ----

    def build_response(res)
      cls = @responses[res.status]
      raise ConfigError, "s#{res.status} は #{module_name} に宣言されていません" unless cls && res.is_a?(cls)

      out = RawResponse.new(res.status)
      if cls.body_type
        Codec.validate(cls.body_type, res.body, "")
        out.body = JSON.generate(Codec.encode(cls.body_type, res.body)).b
        out.headers["Content-Type"] = "application/json"
      end
      if cls.headers_class
        res.headers.validate
        write_headers(out.headers, cls.headers_class, res.headers)
      end
      out.set_cookies << Cookies.serialize(@cookie_def, res.cookie) if res.cookie
      out
    end

    private

    def write_headers(headers, klass, model)
      klass.fields.each do |f|
        vs = Codec.to_wire_list(f.type, model.public_send(f.attr))
        headers[f.json] = vs.join(", ") unless vs.empty?
      end
    end

    # Hash / array values other than the body go straight through the type description (Model references are built from hashes)
    def coerce_body(t, v)
      kind = Codec.kind_of(t)
      case kind
      when :ref
        k = Codec.resolve(t[1])
        k.respond_to?(:coerce) ? k.coerce(v) : v
      when :array then v.map { |x| coerce_body(t[1], x) }
      when :nullable then v.nil? ? nil : coerce_body(t[1], v)
      else v
      end
    end
  end
end

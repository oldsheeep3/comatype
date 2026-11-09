# frozen_string_literal: true

module Comatype
  # Parent of the per-status responses. Generated code declares `class S200 < Comatype::Response`.
  #   status 200 / body_type <type description> / headers_class <Model subclass>
  # The server returns `S200.new(body, headers: {...})`; the client receives an instance of this class.
  class Response
    class << self
      def status(n = nil)
        n.nil? ? @status : (@status = n)
      end

      def body_type(t = nil)
        t.nil? ? @body_type : (@body_type = t)
      end

      def headers_class(k = nil)
        k.nil? ? @headers_class : (@headers_class = k)
      end

      # Build the RawResponse a wrapper returns (no headers / cookies). Used by the generated `Init.s401(body)`
      def raw(body = nil)
        out = RawResponse.new(status)
        if body_type
          Codec.validate(body_type, body, "")
          out.body = JSON.generate(Codec.encode(body_type, body)).b
          out.headers["Content-Type"] = "application/json"
        end
        out
      end
    end

    attr_reader :body, :headers, :cookie

    # A status without a body is `S204.new`; headers only is `S200.new(headers: {...})`
    def initialize(body = nil, headers: nil)
      if body.nil? && self.class.body_type && !(self.class.body_type.is_a?(Array) && self.class.body_type[0] == :nullable)
        raise ArgumentError, "#{self.class.name} にはボディが要ります"
      end
      raise ArgumentError, "#{self.class.name} にはボディを渡せません" if !body.nil? && self.class.body_type.nil?

      @body = body
      hc = self.class.headers_class
      raise ArgumentError, "#{self.class.name} にはヘッダを渡せません" if headers && hc.nil?

      @headers = hc ? (hc.coerce(headers) || hc.new) : nil
      @cookie = nil
    end

    def status
      self.class.status
    end

    # Issue a cookie from init.comat (server)
    def with_cookie(value, max_age: nil, path: nil, domain: nil)
      @cookie = CookieValue.new(value: value, delete: false, max_age: max_age, path: path, domain: domain)
      self
    end

    # Delete a cookie (server)
    def clear_cookie
      @cookie = CookieValue.new(value: "", delete: true)
      self
    end

    def to_s
      "#<#{self.class.name} body=#{@body.inspect} headers=#{@headers.inspect}>"
    end
    alias inspect to_s
  end
end

# frozen_string_literal: true

module Comatype
  # Case-insensitive headers (the same name may appear several times).
  class Headers
    include Enumerable

    def initialize
      @items = []
    end

    def [](name)
      kv = @items.find { |k, _| k.casecmp?(name) }
      kv&.last
    end

    def get_all(name)
      @items.select { |k, _| k.casecmp?(name) }.map(&:last)
    end

    # Replace entries with the same name
    def []=(name, value)
      @items.reject! { |k, _| k.casecmp?(name) }
      @items << [name, value.to_s]
    end

    # Add, keeping entries with the same name
    def add(name, value)
      @items << [name, value.to_s]
    end

    def key?(name)
      !self[name].nil?
    end

    def each(&block)
      @items.each(&block)
    end
  end

  # The raw request a wrapper sees (the on-the-wire form, with no per-endpoint types).
  class RawRequest
    # method: lowercase, path: with params filled in (client) / the path that arrived (server)
    attr_accessor :method, :path, :headers, :query, :params, :body, :cookies, :ctx

    def initialize(method, path)
      @method = method
      @path = path
      @headers = Headers.new
      @query = []
      @params = {}
      @body = "".b
      @cookies = {}
      @ctx = {} # values added by server wrappers (wrapper name -> value)
    end

    def cookie(name)
      @cookies[name.to_s]
    end

    def query_all(name)
      @query.select { |k, _| k == name }.map(&:last)
    end
  end

  # The raw response a wrapper sees (the on-the-wire form).
  class RawResponse
    # set_cookies: Set-Cookie lines to send (server) / lines received (client), err: a cause not included in the response
    attr_accessor :status, :headers, :body, :set_cookies, :err

    def initialize(status)
      @status = status
      @headers = Headers.new
      @body = "".b
      @set_cookies = []
      @err = nil
    end

    def self.json(status, tree)
      r = new(status)
      unless tree.nil?
        r.body = JSON.generate(tree).b
        r.headers["Content-Type"] = "application/json"
      end
      r
    end

    # Turn the server's own error into a 500. Details are not shown to the client.
    def self.error(cause)
      r = new(500)
      r.body = '{"code":"internal_error","message":"Internal Server Error"}'.b
      r.headers["Content-Type"] = "application/json"
      r.err = cause.to_s
      r
    end
  end
end

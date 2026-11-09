# frozen_string_literal: true

module Comatype
  class Error < StandardError; end

  # An input or output does not match the .comat type.
  class ValidationError < Error
    attr_reader :path, :reason

    def initialize(path, reason)
      @path = path
      @reason = reason
      super(path.empty? ? reason : "#{path}: #{reason}")
    end

    def self.join(path, name)
      path.empty? ? name.to_s : "#{path}.#{name}"
    end
  end

  # A status not declared in .comat was returned.
  class UnexpectedStatusError < Error
    attr_reader :status, :body

    def initialize(status, body)
      @status = status
      @body = body
      super("想定していないステータス #{status} が返りました")
    end
  end

  # Configuration error (a wrapper was not passed, no base url, etc.).
  class ConfigError < Error; end

  # The request failed.
  class TransportError < Error; end
end

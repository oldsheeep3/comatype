# frozen_string_literal: true

module Comatype
  module Wire
    module_function

    def parse_json(bytes, path)
      JSON.parse(bytes.dup.force_encoding("UTF-8"))
    rescue JSON::ParserError => e
      raise ValidationError.new(path, "JSON として読めません: #{e.message[0, 80]}")
    end

    def percent_decode(s)
      URI.decode_www_form_component(s.gsub("+", "%2B"))
    rescue ArgumentError
      nil
    end

    def parse_query(q)
      q.to_s.split("&").reject(&:empty?).map do |p|
        k, v = p.split("=", 2)
        [URI.decode_www_form_component(k), URI.decode_www_form_component(v.to_s)]
      end
    rescue ArgumentError
      []
    end
  end
end

# frozen_string_literal: true

module Comatype
  # Converts and validates between Ruby values and JSON trees / strings (path / query / headers) according to a type descriptor.
  #
  #   :string :bool :int :int64 :email :phone :uuid :uuidv4 :uuidv7 :date :datetime :time :decimal :url :bytes :json
  #   [:string, {min: 1, max: 50}]   scalar with constraints (min / max / pattern)
  #   [:array, t]  [:nullable, t]  [:literal, ["a", "b"]]
  #   [:ref, a Model/Enum class, or a Proc that returns it]
  module Codec
    SCALARS = %i[string bool int int64 email phone uuid uuidv4 uuidv7 date datetime time decimal url bytes json].freeze
    STRINGY = %i[string email phone uuid uuidv4 uuidv7 date datetime time decimal url].freeze

    module_function

    def fail!(path, reason)
      raise ValidationError.new(path, reason)
    end

    def kind_of(t)
      t.is_a?(Array) ? t[0] : t
    end

    def resolve(ref)
      ref.is_a?(Proc) ? ref.call : ref
    end

    def describe(j)
      case j
      when nil then "null"
      when String then "文字列"
      when true, false then "真偽値"
      when Numeric then "数値"
      when Array then "配列"
      else "オブジェクト"
      end
    end

    # ---- string -> value (shared by JSON strings and path / query / header strings) ----

    def parse_str(kind, s, path)
      case kind
      when :string then s
      when :email
        fail!(path, "email の形式が不正です") unless s.match?(/\A[^\s@]+@[^\s@]+\.[^\s@]+\z/)
        s
      when :phone
        fail!(path, "phone は E.164 の形式にしてください") unless s.match?(/\A\+[1-9]\d{1,14}\z/)
        s
      when :uuid then Check.uuid(path, s, 0) || s.downcase
      when :uuidv4 then Check.uuid(path, s, 4) || s.downcase
      when :uuidv7 then Check.uuid(path, s, 7) || s.downcase
      when :date
        fail!(path, "date は YYYY-MM-DD の形式にしてください") unless s.match?(/\A\d{4}-\d{2}-\d{2}\z/)
        begin
          Date.strptime(s, "%Y-%m-%d")
        rescue ArgumentError
          fail!(path, "date は YYYY-MM-DD の形式にしてください")
        end
      when :time
        fail!(path, "time は HH:MM:SS の形式にしてください") unless s.match?(/\A([01]\d|2[0-3]):[0-5]\d:[0-5]\d\z/)
        s
      when :datetime
        unless s.match?(/\A\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})\z/)
          fail!(path,
                "datetime は RFC 3339 の形式にしてください")
        end
        begin
          Time.iso8601(s.upcase)
        rescue ArgumentError
          fail!(path, "datetime は RFC 3339 の形式にしてください")
        end
      when :decimal
        fail!(path, "decimal は数値の文字列にしてください") unless s.match?(/\A-?\d+(\.\d+)?\z/)
        BigDecimal(s)
      when :url
        u = begin
          URI.parse(s)
        rescue URI::InvalidURIError
          nil
        end
        fail!(path, "url は http(s)://host/... の形式にしてください") unless u && u.scheme && u.host
        u
      when :bool
        return true if s == "true"
        return false if s == "false"

        fail!(path, "真偽値は true か false にしてください")
      when :int, :int64
        fail!(path, "整数ではありません") unless s.strip.match?(/\A-?\d+\z/)
        s.strip.to_i
      else
        fail!(path, "#{kind} は path・クエリ・ヘッダに使えない型です")
      end
    end

    # value -> string (path, query, headers)
    def to_wire(kind, v)
      case kind
      when :date then v.strftime("%Y-%m-%d")
      when :datetime then v.utc.iso8601(3)
      when :decimal then v.to_s("F")
      else v.to_s
      end
    end

    # ---- JSON tree -> value ----

    def decode(t, j, path = "")
      kind = kind_of(t)
      case kind
      when :nullable then j.nil? ? nil : decode(t[1], j, path)
      when :array
        fail!(path, "配列にしてください（#{describe(j)} でした）") unless j.is_a?(Array)
        j.each_with_index.map { |x, i| decode(t[1], x, "#{path}[#{i}]") }
      when :literal
        fail!(path, "文字列にしてください（#{describe(j)} でした）") unless j.is_a?(String)
        Check.one_of(path, j, t[1])
        j
      when :ref then resolve(t[1]).decode(j, path)
      else decode_scalar(kind, t.is_a?(Array) ? t[1] : nil, j, path)
      end
    end

    def decode_scalar(kind, constraint, j, path)
      v =
        case kind
        when :bool
          fail!(path, "真偽値にしてください（#{describe(j)} でした）") unless [true, false].include?(j)
          j
        when :int
          ok = j.is_a?(Integer) || (j.is_a?(Float) && j == j.floor && j.abs < 9e15)
          fail!(path, "整数にしてください（#{describe(j)} でした）") unless ok
          j.to_i
        when :int64
          fail!(path, "int64 は整数の文字列で送ってください") unless j.is_a?(String) && j.match?(/\A-?\d+\z/)
          j.to_i
        when :bytes
          fail!(path, "文字列にしてください（#{describe(j)} でした）") unless j.is_a?(String)
          begin
            Base64.strict_decode64(j)
          rescue ArgumentError
            fail!(path, "bytes は base64 の文字列にしてください")
          end
        when :json then j
        else
          fail!(path, "文字列にしてください（#{describe(j)} でした）") unless j.is_a?(String)
          parse_str(kind, j, path)
        end
      check_constraint(kind, constraint, v, path)
      v
    end

    def check_constraint(kind, c, v, path)
      return unless c

      if STRINGY.include?(kind) && kind != :decimal
        s = v.is_a?(String) ? v : to_wire(kind, v)
        Check.len(path, s, c[:min], c[:max]) if c[:min] || c[:max]
        Check.pattern(path, s, c[:pattern]) if c[:pattern]
      elsif %i[int int64].include?(kind)
        Check.range(path, v, c[:min], c[:max])
      elsif kind == :decimal
        Check.range(path, v, c[:min], c[:max])
        Check.pattern(path, v.to_s("F"), c[:pattern]) if c[:pattern]
      end
    end

    # ---- value validation (values built by the user; types and constraints) ----

    def validate(t, v, path = "")
      kind = kind_of(t)
      case kind
      when :nullable then v.nil? || validate(t[1], v, path)
      when :array
        fail!(path, "配列にしてください") unless v.is_a?(Array)
        v.each_with_index { |x, i| validate(t[1], x, "#{path}[#{i}]") }
      when :literal then Check.one_of(path, v, t[1])
      when :ref then resolve(t[1]).validate_value(v, path)
      else validate_scalar(kind, t.is_a?(Array) ? t[1] : nil, v, path)
      end
    end

    def validate_scalar(kind, constraint, v, path)
      case kind
      when :string then fail!(path, "文字列にしてください") unless v.is_a?(String)
      when :bool then fail!(path, "真偽値にしてください") unless [true, false].include?(v)
      when :int, :int64 then fail!(path, "整数にしてください") unless v.is_a?(Integer)
      when :date then fail!(path, "date は Date にしてください") unless v.is_a?(Date)
      when :datetime then fail!(path, "datetime は Time にしてください") unless v.is_a?(Time)
      when :decimal then fail!(path, "decimal は BigDecimal にしてください") unless v.is_a?(BigDecimal)
      when :url then fail!(path, "url は URI にしてください") unless v.is_a?(URI::Generic)
      when :bytes then fail!(path, "bytes は文字列にしてください") unless v.is_a?(String)
      when :json then nil
      else
        fail!(path, "文字列にしてください") unless v.is_a?(String)
        parse_str(kind, v, path)
      end
      check_constraint(kind, constraint, v, path)
    end

    # ---- value -> JSON tree (assumed already validated) ----

    def encode(t, v)
      return nil if v.nil?

      kind = kind_of(t)
      case kind
      when :nullable then encode(t[1], v)
      when :array then v.map { |x| encode(t[1], x) }
      when :literal then v
      when :ref then resolve(t[1]).encode_value(v)
      else encode_scalar(kind, v)
      end
    end

    def encode_scalar(kind, v)
      case kind
      when :int64 then v.to_s
      when :bytes then Base64.strict_encode64(v)
      when :json, :bool, :int, :string then v
      when :uuid, :uuidv4, :uuidv7 then v.downcase
      else to_wire(kind, v)
      end
    end

    # ---- path, query, headers ----

    # With `split` (headers), an array arrives as one ", "-separated value
    def from_wire(t, vals, name, split)
      kind = kind_of(t)
      case kind
      when :nullable then vals.empty? ? nil : from_wire(t[1], vals, name, split)
      when :array
        fail!(name, "必須です") if vals.empty?
        items = vals
        items = (vals[0].strip.empty? ? [] : vals[0].split(",", -1).map(&:strip)) if split && vals.size == 1
        items.map { |s| from_wire(t[1], [s], name, false) }
      else
        fail!(name, "必須です") if vals.empty?
        s = vals[0]
        case kind
        when :ref then resolve(t[1]).from_string(s, name)
        when :literal
          Check.one_of(name, s, t[1])
          s
        else
          v = parse_str(kind, s, name)
          check_constraint(kind, t.is_a?(Array) ? t[1] : nil, v, name)
          v
        end
      end
    end

    # value -> list of strings (nil is empty)
    def to_wire_list(t, v)
      return [] if v.nil?

      kind = kind_of(t)
      case kind
      when :nullable then to_wire_list(t[1], v)
      when :array then v.flat_map { |x| to_wire_list(t[1], x) }
      when :ref then [resolve(t[1]).to_string(v)]
      when :literal then [v.to_s]
      else [to_wire(kind, v)]
      end
    end
  end
end

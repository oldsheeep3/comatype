# frozen_string_literal: true

module Comatype
  # A named string enum. Declare values with `values "admin", "member"` (constants are uppercase: Role::ADMIN).
  class Enum
    class << self
      def values(*vals)
        return @values if vals.empty?

        @values = vals.freeze
        vals.each { |v| const_set(v.to_s.upcase.gsub(/[^A-Z0-9]/, "_").sub(/\A(\d)/, 'V_\1'), v) }
      end

      def decode(j, path = "")
        raise ValidationError.new(path, "文字列にしてください（#{Codec.describe(j)} でした）") unless j.is_a?(String)

        Check.one_of(path, j, values)
        j
      end

      def validate_value(v, path)
        Check.one_of(path, v, values)
      end

      def encode_value(v)
        v
      end

      def from_string(s, name)
        Check.one_of(name, s, values)
        s
      end

      def to_string(v)
        v.to_s
      end
    end
  end

  # Object type. Subclasses declare `field :attr, "jsonName", type, optional: true`.
  # Parent of generated types (named types, params / search / headers, body).
  class Model
    Field = Struct.new(:attr, :json, :type, :optional)

    class << self
      def fields
        @fields ||= []
      end

      def inherited(sub)
        super
        sub.instance_variable_set(:@fields, fields.dup)
      end

      def field(attr, json, type, optional: false)
        fields << Field.new(attr, json, type, optional)
        attr_accessor attr
      end

      def nullable?(t)
        t.is_a?(Array) && t[0] == :nullable
      end

      # JSON tree -> instance
      def decode(j, path = "")
        raise ValidationError.new(path, "オブジェクトにしてください（#{Codec.describe(j)} でした）") unless j.is_a?(Hash)

        kw = {}
        fields.each do |f|
          p = ValidationError.join(path, f.json)
          if !j.key?(f.json) || (j[f.json].nil? && f.optional)
            raise ValidationError.new(p, "必須です") unless f.optional || nullable?(f.type)

            kw[f.attr] = nil
            next
          end
          kw[f.attr] = Codec.decode(f.type, j[f.json], p)
        end
        new(**kw)
      end

      # Build from path / query / header values (a call that returns name -> list of strings)
      def from_wire(lookup, split: false)
        kw = {}
        fields.each do |f|
          vals = lookup.call(f.json)
          if vals.empty?
            raise ValidationError.new(f.json, "必須です") unless f.optional || nullable?(f.type)

            kw[f.attr] = nil
          else
            kw[f.attr] = Codec.from_wire(f.type, vals, f.json, split)
          end
        end
        new(**kw)
      end

      # Entry point for validating nested values
      def validate_value(v, path)
        raise ValidationError.new(path, "#{name} にしてください") unless v.is_a?(self)

        v.validate(path)
      end

      def encode_value(v)
        v.encode
      end

      # Turn a hash (keyed by attr) or an existing instance into an instance of this class
      def coerce(v)
        return v if v.is_a?(self) || v.nil?
        return new(**v.transform_keys(&:to_sym)) if v.is_a?(Hash)

        raise ArgumentError, "#{name} かハッシュを渡してください（#{v.class}）"
      end
    end

    def initialize(**kw)
      unknown = kw.keys - self.class.fields.map(&:attr)
      raise ArgumentError, "#{self.class.name} に無いキー: #{unknown.join(', ')}" unless unknown.empty?

      self.class.fields.each { |f| instance_variable_set("@#{f.attr}", kw[f.attr]) }
    end

    # Check that it matches the .comat type (including constraints)
    def validate(path = "")
      self.class.fields.each do |f|
        v = instance_variable_get("@#{f.attr}")
        p = ValidationError.join(path, f.json)
        if v.nil?
          raise ValidationError.new(p, "必須です") unless f.optional || self.class.nullable?(f.type)

          next
        end
        Codec.validate(f.type, v, p)
      end
      true
    end

    # JSON tree (Hash with string keys). Validated before it is built
    def encode
      validate
      self.class.fields.each_with_object({}) do |f, h|
        v = instance_variable_get("@#{f.attr}")
        next if v.nil? && f.optional

        h[f.json] = Codec.encode(f.type, v)
      end
    end

    def to_h
      self.class.fields.to_h { |f| [f.attr, instance_variable_get("@#{f.attr}")] }
    end

    def ==(other)
      other.class == self.class && other.to_h == to_h
    end

    def to_s
      "#<#{self.class.name} #{to_h.inspect}>"
    end
    alias inspect to_s
  end
end

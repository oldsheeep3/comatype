# frozen_string_literal: true

module Comatype
  # Validation and constraints (min / max / pattern / oneof).
  module Check
    module_function

    # Character-count range (`string(1..50)`)
    def len(path, s, min, max)
      n = s.to_s.length
      raise ValidationError.new(path, "文字数は #{min} 以上にしてください") if min && n < min
      raise ValidationError.new(path, "文字数は #{max} 以下にしてください") if max && n > max
    end

    # Value range (`int(0..150)`)
    def range(path, n, min, max)
      raise ValidationError.new(path, "値は #{min} 以上にしてください") if min && n < min
      raise ValidationError.new(path, "値は #{max} 以下にしてください") if max && n > max
    end

    def pattern(path, s, pattern)
      re = begin
        Regexp.new(pattern)
      rescue RegexpError
        raise ValidationError.new(path, "pattern #{pattern.inspect} が不正です")
      end
      raise ValidationError.new(path, "パターン #{pattern} に一致しません") unless re.match?(s.to_s)
    end

    def one_of(path, s, values)
      raise ValidationError.new(path, "#{values.join(' | ')} のどれかにしてください") unless values.include?(s)
    end

    UUID_RE = /\A[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-([0-9a-fA-F])[0-9a-fA-F]{3}-([89abAB])[0-9a-fA-F]{3}-[0-9a-fA-F]{12}\z/.freeze
    UUID_ANY = /\A[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\z/.freeze

    def uuid(path, s, version)
      label = version.zero? ? "uuid" : "uuidv#{version}"
      raise ValidationError.new(path, "#{label} の形式が不正です") unless s.is_a?(String) && UUID_ANY.match?(s)
      return if version.zero?

      m = UUID_RE.match(s)
      raise ValidationError.new(path, "#{label} の形式が不正です") unless m && m[1] == version.to_s
    end
  end
end

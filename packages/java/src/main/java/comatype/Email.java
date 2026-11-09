package comatype;

import java.util.regex.Pattern;

/** An email address. A string on the wire. */
public record Email(String value) {
    private static final Pattern RE = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    public void validate(String path) {
        if (value == null || !RE.matcher(value).matches())
            throw new ValidationException(path, "email の形式が不正です");
    }

    @Override
    public String toString() {
        return value;
    }
}

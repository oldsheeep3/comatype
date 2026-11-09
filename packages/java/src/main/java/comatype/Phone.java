package comatype;

import java.util.regex.Pattern;

/** An E.164 phone number. A string on the wire. */
public record Phone(String value) {
    private static final Pattern RE = Pattern.compile("^\\+[1-9]\\d{1,14}$");

    public void validate(String path) {
        if (value == null || !RE.matcher(value).matches())
            throw new ValidationException(path, "phone は E.164 の形式にしてください");
    }

    @Override
    public String toString() {
        return value;
    }
}

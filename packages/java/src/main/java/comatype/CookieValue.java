package comatype;

/** A cookie to issue. */
public final class CookieValue {
    public final String value;
    public final boolean delete;
    public Long maxAge;
    public String path;
    public String domain;

    private CookieValue(String value, boolean delete) {
        this.value = value;
        this.delete = delete;
    }

    public static CookieValue of(String value) {
        return new CookieValue(value, false);
    }

    /** Deletes the cookie */
    public static CookieValue clear() {
        return new CookieValue("", true);
    }

    public CookieValue maxAge(long seconds) {
        this.maxAge = seconds;
        return this;
    }

    public CookieValue path(String p) {
        this.path = p;
        return this;
    }

    public CookieValue domain(String d) {
        this.domain = d;
        return this;
    }
}

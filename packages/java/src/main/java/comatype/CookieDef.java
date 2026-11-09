package comatype;

/** `cookie <name> { ... }` in init.comat. */
public record CookieDef(
        String name,
        boolean httpOnly,
        boolean secure,
        String sameSite,
        String path,
        String domain,
        Long maxAge) {}

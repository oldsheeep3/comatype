package comatype;

/**
 * `cache` in `.comat` (GET / QUERY endpoints only). mode is "off" (never cache) / "memory" (in
 * memory for the ttl) / "cookie" (in a cookie for the ttl; client only).
 */
public record CacheSpec(String mode, long ttlMs) {
    public boolean memory() {
        return mode.equals("memory") && ttlMs > 0;
    }

    public boolean cookie() {
        return mode.equals("cookie") && ttlMs > 0;
    }
}

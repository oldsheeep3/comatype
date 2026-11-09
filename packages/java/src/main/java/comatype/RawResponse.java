package comatype;

import java.util.ArrayList;
import java.util.List;

/** The raw response (wire form) as seen by wrappers. */
public final class RawResponse {
    public int status;
    public Headers headers = new Headers();
    public byte[] body = new byte[0];
    /** Set-Cookie lines to issue (server). On the client, the received lines */
    public List<String> setCookies = new ArrayList<>();
    /** The cause wrapped by {@link #error} (not included in the response) */
    public String err;

    public RawResponse(int status) {
        this.status = status;
    }

    /** Creates a RawResponse whose body is the given JSON tree (null means no body). */
    public static RawResponse json(int status, Object tree) {
        RawResponse r = new RawResponse(status);
        if (tree != null) {
            r.body = Json.bytes(tree);
            r.headers.set("Content-Type", "application/json");
        }
        return r;
    }

    /** Converts a generated object type to JSON (used by wrappers, e.g. `S401(...)`). */
    public static RawResponse json(int status, JsonType body) {
        if (body == null) return new RawResponse(status);
        body.validate("");
        return json(status, body.encode());
    }

    /** Turns a server-side fault into a 500. The details are not shown to the client. */
    public static RawResponse error(String cause) {
        RawResponse r = new RawResponse(500);
        r.body = "{\"code\":\"internal_error\",\"message\":\"Internal Server Error\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        r.headers.set("Content-Type", "application/json");
        r.err = cause;
        return r;
    }
}

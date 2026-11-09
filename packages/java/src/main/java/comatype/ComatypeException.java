package comatype;

/** The parent of exceptions thrown by the runtime. */
public class ComatypeException extends RuntimeException {
    public ComatypeException(String message) {
        super(message);
    }

    public ComatypeException(String message, Throwable cause) {
        super(message, cause);
    }

    /** A status not declared in .comat was returned. */
    public static final class UnexpectedStatus extends ComatypeException {
        public final int status;
        public final byte[] body;

        public UnexpectedStatus(int status, byte[] body) {
            super("想定していないステータス " + status + " が返りました");
            this.status = status;
            this.body = body;
        }
    }

    /** A configuration error (a wrapper not passed, no base url, etc.). */
    public static final class Config extends ComatypeException {
        public Config(String message) {
            super(message);
        }
    }

    /** The request failed. */
    public static final class Transport extends ComatypeException {
        public Transport(String message, Throwable cause) {
            super(message, cause);
        }
    }
}

package comatype;

/** Input or output does not match a .comat type. */
public class ValidationException extends ComatypeException {
    public final String path;
    public final String reason;

    public ValidationException(String path, String reason) {
        super(path.isEmpty() ? reason : path + ": " + reason);
        this.path = path;
        this.reason = reason;
    }

    public static String join(String path, String name) {
        return path.isEmpty() ? name : path + "." + name;
    }
}

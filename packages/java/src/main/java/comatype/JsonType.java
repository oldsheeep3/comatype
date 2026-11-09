package comatype;

/** Implemented by generated object types. */
public interface JsonType {
    /** Checks that the value matches the .comat type (including constraints). */
    void validate(String path);

    /** Converts to a JSON tree (assumes the value is already validated). */
    Object encode();
}

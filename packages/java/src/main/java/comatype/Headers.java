package comatype;

import java.util.ArrayList;
import java.util.List;

/** Case-insensitive headers (the same name can appear multiple times). */
public final class Headers {
    private final List<String[]> items = new ArrayList<>();

    public String get(String name) {
        for (String[] kv : items) if (kv[0].equalsIgnoreCase(name)) return kv[1];
        return null;
    }

    public List<String> getAll(String name) {
        List<String> out = new ArrayList<>();
        for (String[] kv : items) if (kv[0].equalsIgnoreCase(name)) out.add(kv[1]);
        return out;
    }

    /** Replaces entries with the same name */
    public Headers set(String name, String value) {
        items.removeIf(kv -> kv[0].equalsIgnoreCase(name));
        items.add(new String[] {name, value});
        return this;
    }

    /** Adds, keeping entries with the same name */
    public Headers add(String name, String value) {
        items.add(new String[] {name, value});
        return this;
    }

    public boolean contains(String name) {
        return get(name) != null;
    }

    public List<String[]> entries() {
        return items;
    }
}

package app;

import comatype.S;
import comatype.gen.Init;

public final class InitComatype {
    private InitComatype() {}

    /** Call once at startup. The cookie settings (name, httpOnly, etc.) are in init.comat */
    public static void init(S s) {
        // With the generated Wrappers, a missing wrapper declared in init.comat, or a wrong type, is a compile error
        s.init(new Init.Wrappers(Auth.auth));
    }
}

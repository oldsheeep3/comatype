package app;

import comatype.C;
import comatype.CookieJar;
import comatype.gen.Init;

public final class InitComatype {
    private InitComatype() {}

    /** Call once at startup. The base url defaults to baseUrl in init.comat (override with the COMATYPE_BASE_URL environment variable or Config.baseUrl) */
    public static void init() {
        C.init(new C.Config()
                // With the generated Wrappers, a missing wrapper declared in init.comat is a compile error
                .wrappers(new Init.Wrappers(Auth.auth))
                // Used by `cookie on` endpoints. The cookie jar keeps the httpOnly cookie
                .cookieJar(new CookieJar()));
    }
}

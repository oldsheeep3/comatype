// Client init file: pass the implemented ComatypeWrap
// The base url defaults to baseUrl in init.comat. Override with the COMATYPE_BASE_URL environment variable or Config.baseUrl
// Call initComatype() once at startup (whether a wrapper is on or off is decided by defaults.comat and `wrap` in each .comat)
import comatype.CookieJar
import comatype.gen.Init
import comatype.ktx.CK

fun initComatype() {
    CK.init(
        CK.Config(
            // With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a compile error
            wrappers = Init.Wrappers(auth),
            // Used by `cookie on` endpoints. The cookie jar keeps the httpOnly cookie
            cookieJar = CookieJar(),
        )
    )
}

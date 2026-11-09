// Client init file: pass the implemented ComatypeWrap
// The base url defaults to baseUrl in init.comat. Override with the COMATYPE_BASE_URL environment variable or Config.BaseUrl
// Call InitComatype.Run() once at startup (whether a wrapper is on or off is decided by defaults.comat and `wrap` in each .comat)
using Comatype;
using ComatypeGen;

public static class InitComatype
{
    public static void Run()
    {
        C.Init(
            new C.Config()
                // With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a compile error
                .WithWrappers(new Init.Wrappers(Auth.Wrap))
                // Used by `cookie on` endpoints. The cookie jar keeps the httpOnly cookie
                .WithCookieJar(new CookieJar())
        );
    }
}

// Server init file: pass the implemented ComatypeWrap
// The cookie settings (name, httpOnly, etc.) are in init.comat
using Comatype;
using ComatypeGen;

public static class InitComatype
{
    public static void Run(S s)
    {
        // With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a compile error
        s.Init(new Init.Wrappers(Auth.Wrap));
    }
}

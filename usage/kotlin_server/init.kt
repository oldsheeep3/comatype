// Server init file: pass the implemented ComatypeWrap
// The cookie settings (name, httpOnly, etc.) are in init.comat
import comatype.S
import comatype.gen.Init
import comatype.ktx.init

fun initComatype(s: S) {
    // With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a compile error
    s.init(Init.Wrappers(auth))
}

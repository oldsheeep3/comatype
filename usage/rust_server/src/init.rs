// Server init: pass the implemented ComatypeWrap. The cookie settings (name, httpOnly, etc.) are in init.comat
use crate::comatype_gen::init::Wrappers;
use comatype::s::Server;

pub fn init_comatype(server: &Server) {
    // With the generated Wrappers, a missing wrapper declared in init.comat, or a wrong type, is a compile error
    server.init(Wrappers { auth: crate::auth::auth() });
}

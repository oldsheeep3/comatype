// Client init: pass the implemented ComatypeWrap
// The base url defaults to baseUrl in init.comat. Override with the COMATYPE_BASE_URL environment variable or Config.base_url
use crate::comatype_gen::init::Wrappers;
use comatype::c::{self, Config};
use comatype::CookieJar;
use std::sync::Arc;

pub fn init_comatype() {
    c::init(Config {
        // Used by `cookie on` endpoints. The cookie jar keeps the httpOnly cookie
        cookie_jar: Some(Arc::new(CookieJar::new())),
        // With the generated Wrappers, a missing wrapper declared in init.comat is a compile error
        ..Config::default().wrappers(Wrappers { auth: crate::auth::auth() })
    });
}

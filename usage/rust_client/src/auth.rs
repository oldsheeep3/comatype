// Implement a wrapper as a ComatypeWrap value (corresponds to the `wrapper auth` of init.comat)
use comatype::c::ComatypeWrap;

pub fn auth() -> ComatypeWrap {
    ComatypeWrap::new(|mut req, next| {
        req.headers.set("Authorization", format!("Bearer {}", std::env::var("API_TOKEN").unwrap_or_default()));
        next(req)
    })
}

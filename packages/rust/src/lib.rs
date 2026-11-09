//! Rust runtime for Comatype.
//!
//! - `c`: client (`c::get(&ENDPOINT, arg)`)
//! - `s`: server (`s::Server`)
//! - the rest: generated code and parts shared by c / s

pub use serde;
pub use serde_json;

pub mod c;
pub mod cache;
pub mod cookie;
pub mod error;
pub mod raw;
pub mod s;
pub mod scalars;
pub mod validate;
pub mod wire;

pub use cache::{CacheMode, CacheSpec};
pub use cookie::{CookieDef, CookieJar, CookieValue};
pub use error::{Error, Result, ValidationError};
pub use raw::{ctx_value, Endpoint, Headers, NoArg, RawRequest, RawResponse};
pub use scalars::*;
pub use validate::Validate;
pub use wire::Wire;

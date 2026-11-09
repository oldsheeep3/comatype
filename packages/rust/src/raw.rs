//! Raw request / response seen by wrappers (the wire shape; no per-endpoint types).

use crate::error::{Error, Result};
use std::any::Any;
use std::collections::BTreeMap;
use std::sync::Arc;

/// Case-insensitive headers (the same name can appear several times).
#[derive(Debug, Clone, Default)]
pub struct Headers(Vec<(String, String)>);

impl Headers {
    pub fn new() -> Self {
        Headers(Vec::new())
    }
    pub fn get(&self, name: &str) -> Option<&str> {
        self.0.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
    }
    pub fn get_all(&self, name: &str) -> Vec<&str> {
        self.0.iter().filter(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str()).collect()
    }
    /// Replaces the same name
    pub fn set(&mut self, name: &str, value: impl Into<String>) {
        self.0.retain(|(k, _)| !k.eq_ignore_ascii_case(name));
        self.0.push((name.to_string(), value.into()));
    }
    /// Adds, keeping the same name
    pub fn add(&mut self, name: &str, value: impl Into<String>) {
        self.0.push((name.to_string(), value.into()));
    }
    pub fn contains(&self, name: &str) -> bool {
        self.get(name).is_some()
    }
    pub fn iter(&self) -> impl Iterator<Item = (&str, &str)> {
        self.0.iter().map(|(k, v)| (k.as_str(), v.as_str()))
    }
}

pub type Contexts = BTreeMap<String, Arc<dyn Any + Send + Sync>>;

#[derive(Clone)]
pub struct RawRequest {
    /// Lower case (get, post, ...)
    pub method: String,
    /// The path after filling in the parameters (client), or the path that arrived (server)
    pub path: String,
    pub headers: Headers,
    pub query: Vec<(String, String)>,
    pub params: BTreeMap<String, String>,
    pub body: Vec<u8>,
    pub cookies: BTreeMap<String, String>,
    /// ctx added by server wrappers (wrapper name -> value)
    pub contexts: Contexts,
}

impl RawRequest {
    pub fn new(method: &str, path: &str) -> Self {
        RawRequest {
            method: method.to_string(),
            path: path.to_string(),
            headers: Headers::new(),
            query: Vec::new(),
            params: BTreeMap::new(),
            body: Vec::new(),
            cookies: BTreeMap::new(),
            contexts: Contexts::new(),
        }
    }
    /// Received cookie values
    pub fn cookie(&self, name: &str) -> Option<&str> {
        self.cookies.get(name).map(String::as_str)
    }
    pub fn query_all(&self, name: &str) -> Vec<&str> {
        self.query.iter().filter(|(k, _)| k == name).map(|(_, v)| v.as_str()).collect()
    }
}

#[derive(Debug, Clone)]
pub struct RawResponse {
    pub status: u16,
    pub headers: Headers,
    pub body: Vec<u8>,
    /// Set-Cookie lines to issue (server). On the client, the lines received
    pub set_cookies: Vec<String>,
    /// The cause wrapped by `error_response` (not shown in the response)
    pub err: Option<String>,
}

impl RawResponse {
    pub fn new(status: u16) -> Self {
        RawResponse { status, headers: Headers::new(), body: Vec::new(), set_cookies: Vec::new(), err: None }
    }
    /// Builds a RawResponse whose body is JSON (wrappers use it for `s401(..)` etc.).
    pub fn json<T: serde::Serialize>(status: u16, body: Option<&T>) -> Self {
        let mut r = RawResponse::new(status);
        if let Some(b) = body {
            match serde_json::to_vec(b) {
                Ok(v) => {
                    r.body = v;
                    r.headers.set("Content-Type", "application/json");
                }
                Err(e) => return RawResponse::error(&e.to_string()),
            }
        }
        r
    }
    /// Turns the server's own error into a 500. The details are not shown to the client.
    pub fn error(cause: &str) -> Self {
        let mut r = RawResponse::new(500);
        r.body = br#"{"code":"internal_error","message":"Internal Server Error"}"#.to_vec();
        r.headers.set("Content-Type", "application/json");
        r.err = Some(cause.to_string());
        r
    }
}

/// Arg for endpoints with no request arguments.
#[derive(Debug, Clone, Copy, Default)]
pub struct NoArg;

/// Body of errors such as 400 that are not in the .comat Response.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub path: String,
}

/// Endpoint descriptor (generated code holds it as a `static`).
/// Arg is what the client passes, Req is the request the server handler receives, Res is the response.
pub struct Endpoint<Arg, Req, Res> {
    pub method: &'static str,
    pub path: &'static str,
    pub module: &'static str,
    pub base_url: Option<&'static str>,
    /// Outermost to innermost
    pub wraps: &'static [&'static str],
    pub cookie: bool,
    pub cookie_def: Option<crate::cookie::CookieDef>,
    /// The `cache` setting (GET / QUERY only; None means no caching) and the names of the declared request headers that go into the client cache key
    pub cache: Option<crate::cache::CacheSpec>,
    pub cache_headers: &'static [&'static str],
    // Client
    pub build_request: Option<fn(&Arg) -> Result<RawRequest>>,
    pub parse_response: Option<fn(&RawResponse) -> Result<Res>>,
    // Server
    pub parse_request: Option<fn(&RawRequest) -> Result<Req>>,
    pub build_response: Option<fn(Res) -> Result<RawResponse>>,
}

/// Takes out the ctx added by wrapper `name`.
pub fn ctx_value<T: Clone + 'static>(raw: &RawRequest, name: &str) -> Result<T> {
    raw.contexts
        .get(name)
        .and_then(|v| v.downcast_ref::<T>())
        .cloned()
        .ok_or_else(|| Error::Internal(format!("ラッパー {name} が ctx を設定していません")))
}

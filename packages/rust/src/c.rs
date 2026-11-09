//! Client. Call it like `c::get(&ENDPOINT, arg)`.
//!
//! The argument type `Arg` follows the request shape: `Request` if there are params / search, `Body` if only a body, `NoArg` otherwise.

use crate::cache::{
    cache_cookie_name, cacheable, client_cache_key, decode_cache_cookie, encode_cache_cookie, MemoryCache, CACHE_COOKIE_PREFIX,
};
use crate::cookie::CookieJar;
use crate::error::{Error, Result};
use crate::raw::{Endpoint, RawRequest, RawResponse};
use crate::wire::percent_encode;
use std::collections::BTreeMap;
use std::io::Read;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

/// Calls the next wrapper (the last one does the network call).
pub type Next<'a> = &'a dyn Fn(RawRequest) -> Result<RawResponse>;

/// A wrapper implementation. It can rewrite both the request and the response. One per `wrapper <name>` in `init.comat`.
#[derive(Clone)]
#[allow(clippy::type_complexity)]
pub struct ComatypeWrap(pub Arc<dyn Fn(RawRequest, Next) -> Result<RawResponse> + Send + Sync>);

impl ComatypeWrap {
    pub fn new(f: impl Fn(RawRequest, Next) -> Result<RawResponse> + Send + Sync + 'static) -> Self {
        ComatypeWrap(Arc::new(f))
    }
}

/// Implemented by the generated `Wrappers`.
pub trait WrapperSet {
    fn comatype_wrappers(self) -> BTreeMap<&'static str, ComatypeWrap>;
}

#[derive(Default)]
pub struct Config {
    /// base url priority: here > env var COMATYPE_BASE_URL > baseUrl in init.comat
    pub base_url: Option<String>,
    /// The generated `Wrappers`. An endpoint that uses a missing wrapper fails with an error
    pub wrappers: Option<BTreeMap<&'static str, ComatypeWrap>>,
    /// If given, keeps Set-Cookie for `cookie on` endpoints and sends the cookies back
    pub cookie_jar: Option<Arc<CookieJar>>,
    /// Headers added to every request
    pub headers: Vec<(String, String)>,
    pub timeout: Option<Duration>,
}

impl Config {
    pub fn wrappers(mut self, w: impl WrapperSet) -> Self {
        self.wrappers = Some(w.comatype_wrappers());
        self
    }
}

static STATE: RwLock<Option<Arc<Config>>> = RwLock::new(None);
/// Responses of `cache <ttl>` (memory) endpoints
static CACHE: Mutex<Option<MemoryCache>> = Mutex::new(None);
/// Cookie names of caches stored in cookies (for clear_cache)
static CACHE_COOKIES: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Discards the caches (in memory and in the cookie jar), e.g. on logout.
pub fn clear_cache() {
    if let Some(c) = CACHE.lock().unwrap().as_mut() {
        c.clear();
    }
    let jar = config().cookie_jar.clone();
    for name in CACHE_COOKIES.lock().unwrap().drain(..) {
        if let Some(j) = &jar {
            j.store(&[format!("{name}=; Path=/; Max-Age=0")]);
        }
    }
}

/// Call once at startup.
pub fn init(config: Config) {
    *STATE.write().unwrap() = Some(Arc::new(config));
}

fn config() -> Arc<Config> {
    STATE.read().unwrap().clone().unwrap_or_default()
}

macro_rules! method {
    ($($fn:ident => $m:expr),*) => {$(
        pub fn $fn<Arg, Req, Res>(ep: &Endpoint<Arg, Req, Res>, arg: Arg) -> Result<Res> {
            call($m, ep, &arg)
        }
    )*};
}
method!(get => "get", post => "post", put => "put", patch => "patch", delete => "delete", options => "options", query => "query", head => "head");

fn call<Arg, Req, Res>(method: &str, ep: &Endpoint<Arg, Req, Res>, arg: &Arg) -> Result<Res> {
    if ep.method != method {
        return Err(Error::Config(format!("c::{method}() に {} のエンドポイント（{}）は渡せません", ep.method, ep.module)));
    }
    let (Some(build), Some(parse)) = (ep.build_request, ep.parse_response) else {
        return Err(Error::Config(format!("{} はクライアント用に生成されていません（role: client で生成してください）", ep.module)));
    };
    let conf = config();
    let mut chain = Vec::new();
    for name in ep.wraps {
        let w = conf
            .wrappers
            .as_ref()
            .and_then(|m| m.get(name))
            .ok_or_else(|| Error::Config(format!("ラッパー {name} が init に渡されていません（{}）", ep.module)))?;
        chain.push(w.clone());
    }
    let mut raw = build(arg)?;
    for (k, v) in &conf.headers {
        if !raw.headers.contains(k) {
            raw.headers.set(k, v.clone());
        }
    }
    if !raw.headers.contains("Accept") {
        raw.headers.set("Accept", "application/json");
    }
    if ep.cookie {
        if let Some(jar) = &conf.cookie_jar {
            for (k, v) in jar.get(&raw.path) {
                if !k.starts_with(CACHE_COOKIE_PREFIX) {
                    // Do not send cache cookies back to the server
                    raw.cookies.insert(k, v);
                }
            }
        }
    }
    let send = |r: RawRequest| transport(ep, &conf, r);
    let resp = run(&chain, &send, raw)?;
    parse(&resp)
}

fn run(chain: &[ComatypeWrap], send: &dyn Fn(RawRequest) -> Result<RawResponse>, req: RawRequest) -> Result<RawResponse> {
    match chain.split_first() {
        None => send(req),
        Some((w, rest)) => (w.0)(req, &|r| run(rest, send, r)),
    }
}

fn transport<Arg, Req, Res>(ep: &Endpoint<Arg, Req, Res>, conf: &Config, r: RawRequest) -> Result<RawResponse> {
    let base = conf
        .base_url
        .clone()
        .or_else(|| std::env::var("COMATYPE_BASE_URL").ok().filter(|v| !v.is_empty()))
        .or_else(|| ep.base_url.map(str::to_string))
        .ok_or_else(|| {
            Error::Config(
                "base url がありません（Config.base_url、環境変数 COMATYPE_BASE_URL、init.comat の baseUrl のどれかで指定してください）"
                    .into(),
            )
        })?;
    let mut url = format!("{}{}", base.trim_end_matches('/'), r.path);
    if !r.query.is_empty() {
        let q: Vec<String> = r.query.iter().map(|(k, v)| format!("{}={}", percent_encode(k), percent_encode(v))).collect();
        url.push('?');
        url.push_str(&q.join("&"));
    }
    // Cache (GET / QUERY): memory or cookie. The key is method, URL, body and the declared request headers
    let mut cache_key: Option<String> = None;
    if let Some(spec) = ep.cache {
        if spec.memory() || (spec.cookie() && conf.cookie_jar.is_some()) {
            let key = client_cache_key(&r.method, &url, &r.body, ep.cache_headers, &r.headers);
            let hit = if spec.memory() {
                CACHE.lock().unwrap().as_mut().and_then(|c| c.get(&key))
            } else {
                conf.cookie_jar.as_ref().and_then(|j| j.get("/").get(&cache_cookie_name(&key)).and_then(|v| decode_cache_cookie(v)))
            };
            if let Some(h) = hit {
                return Ok(h);
            }
            cache_key = Some(key);
        }
    }
    // Redirects are not followed, an HTTP error status is a normal response (not a transport error), and QUERY is allowed
    let mut config = ureq::Agent::config_builder().max_redirects(0).http_status_as_error(false).allow_non_standard_methods(true);
    if let Some(t) = conf.timeout {
        config = config.timeout_global(Some(t));
    }
    let agent: ureq::Agent = config.build().into();
    let mut builder = ureq::http::Request::builder().method(r.method.to_ascii_uppercase().as_str()).uri(&url);
    for (k, v) in r.headers.iter() {
        builder = builder.header(k, v);
    }
    if !r.cookies.is_empty() && !r.headers.contains("Cookie") {
        let pairs: Vec<String> = r.cookies.iter().map(|(k, v)| format!("{k}={}", percent_encode(v))).collect();
        builder = builder.header("Cookie", pairs.join("; "));
    }
    let request = builder.body(r.body.clone()).map_err(|e| Error::Transport(e.to_string()))?;
    let res = agent.run(request).map_err(|e| Error::Transport(e.to_string()))?;
    let mut out = RawResponse::new(res.status().as_u16());
    for (name, v) in res.headers() {
        out.headers.add(name.as_str(), String::from_utf8_lossy(v.as_bytes()).into_owned());
    }
    out.set_cookies = res.headers().get_all("set-cookie").iter().map(|v| String::from_utf8_lossy(v.as_bytes()).into_owned()).collect();
    res.into_body().into_reader().read_to_end(&mut out.body).map_err(|e| Error::Transport(e.to_string()))?;
    if ep.cookie && !out.set_cookies.is_empty() {
        if let Some(jar) = &conf.cookie_jar {
            jar.store(&out.set_cookies);
        }
    }
    if let (Some(key), Some(spec)) = (cache_key, ep.cache) {
        if cacheable(&out) {
            if spec.memory() {
                CACHE.lock().unwrap().get_or_insert_with(|| MemoryCache::new(1000)).set(&key, &out, spec.ttl_ms);
            } else if let (Some(jar), Some(v)) = (&conf.cookie_jar, encode_cache_cookie(&out)) {
                let name = cache_cookie_name(&key);
                // The cookie ttl is in seconds (rounded up)
                jar.store(&[format!("{name}={v}; Path=/; Max-Age={}", spec.ttl_ms.div_ceil(1000).max(1))]);
                CACHE_COOKIES.lock().unwrap().push(name);
            }
        }
    }
    Ok(out)
}

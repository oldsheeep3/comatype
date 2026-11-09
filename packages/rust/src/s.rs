//! Server. Register handlers on `Server`, then run with `handle` (callable from any framework) or `serve` (a simple server using only the standard library).

use crate::cache::{cacheable, server_cache_key, CacheSpec, MemoryCache};
use crate::cookie::{serialize_set_cookie, CookieDef, CookieValue};
use crate::error::{Error, Result};
use crate::raw::{Endpoint, ErrorBody, RawRequest, RawResponse};
use crate::wire::{parse_query, percent_decode};
use std::any::Any;
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::ops::Deref;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Arc, RwLock};

/// The request wrappers see. `ctx` holds the values this wrapper adds (the `wrapper` ctx in init.comat).
pub struct WrapRequest<Ctx> {
    pub raw: RawRequest,
    pub ctx: Option<Ctx>,
}

impl<Ctx> WrapRequest<Ctx> {
    /// Adds ctx and makes the request to pass on.
    pub fn with_ctx(mut self, ctx: Ctx) -> Self {
        self.ctx = Some(ctx);
        self
    }
}

impl<Ctx> Deref for WrapRequest<Ctx> {
    type Target = RawRequest;
    fn deref(&self) -> &RawRequest {
        &self.raw
    }
}

/// Calls the next wrapper (the last one is the handler). The `ctx` passed to `next` becomes the ctx of the following wrappers and the handler.
pub type Next<'a, Ctx> = &'a dyn Fn(WrapRequest<Ctx>) -> RawResponse;

/// A wrapper implementation. It can rewrite both the request and the response.
#[allow(clippy::type_complexity)]
pub struct ComatypeWrap<Ctx>(pub Arc<dyn Fn(WrapRequest<Ctx>, Next<Ctx>) -> RawResponse + Send + Sync>);

impl<Ctx> ComatypeWrap<Ctx> {
    pub fn new(f: impl Fn(WrapRequest<Ctx>, Next<Ctx>) -> RawResponse + Send + Sync + 'static) -> Self {
        ComatypeWrap(Arc::new(f))
    }
}

impl<Ctx> Clone for ComatypeWrap<Ctx> {
    fn clone(&self) -> Self {
        ComatypeWrap(self.0.clone())
    }
}

/// The untyped form (made by `adapt`).
pub type ServerWrap = Arc<dyn Fn(RawRequest, &dyn Fn(RawRequest) -> RawResponse) -> RawResponse + Send + Sync>;

/// Turns a typed wrapper into the untyped form (used by the generated `Wrappers`).
pub fn adapt<Ctx: Clone + Send + Sync + 'static>(name: &'static str, w: ComatypeWrap<Ctx>) -> ServerWrap {
    Arc::new(move |req: RawRequest, next: &dyn Fn(RawRequest) -> RawResponse| {
        let ctx = req.contexts.get(name).and_then(|v| v.downcast_ref::<Ctx>()).cloned();
        let typed = WrapRequest { raw: req, ctx };
        (w.0)(typed, &|r: WrapRequest<Ctx>| {
            let mut raw = r.raw;
            if let Some(c) = r.ctx {
                raw.contexts.insert(name.to_string(), Arc::new(c) as Arc<dyn Any + Send + Sync>);
            }
            next(raw)
        })
    })
}

/// Implemented by the generated `Wrappers`.
pub trait WrapperSet {
    fn comatype_wrappers(self) -> BTreeMap<&'static str, ServerWrap>;
}

type Handle = Box<dyn Fn(&RawRequest) -> RawResponse + Send + Sync>;
type OnError = Box<dyn Fn(&str) + Send + Sync>;

struct Route {
    method: &'static str,
    module: &'static str,
    segs: Vec<String>,
    statics: usize,
    wraps: &'static [&'static str],
    cache: Option<CacheSpec>,
    handle: Handle,
}

#[derive(Default)]
pub struct Server {
    routes: RwLock<Vec<Route>>,
    wrappers: RwLock<BTreeMap<&'static str, ServerWrap>>,
    on_error: RwLock<Option<OnError>>,
    /// Responses of `cache <ttl>` (memory) endpoints. Hit on an exact request match
    cache: std::sync::Mutex<Option<MemoryCache>>,
}

/// Return value for when a handler wants to add a cookie (`cookie on` endpoints).
pub struct Reply<R> {
    pub response: R,
    pub cookie: Option<CookieValue>,
}

impl<R> From<R> for Reply<R> {
    fn from(response: R) -> Self {
        Reply { response, cookie: None }
    }
}

impl<R> Reply<R> {
    /// Issue the init.comat cookie
    pub fn with_cookie(mut self, cookie: CookieValue) -> Self {
        self.cookie = Some(cookie);
        self
    }
    /// Delete the cookie
    pub fn clear_cookie(mut self) -> Self {
        self.cookie = Some(CookieValue::clear());
        self
    }
}

/// Adds the cookies of a `Reply` to the `RawResponse` as Set-Cookie (used by generated code).
pub fn apply_cookie(out: &mut RawResponse, def: Option<&CookieDef>, cookie: Option<&CookieValue>) -> Result<()> {
    if let Some(c) = cookie {
        out.set_cookies.push(serialize_set_cookie(def, c)?);
    }
    Ok(())
}

fn pathsegs(p: &str) -> Vec<&str> {
    p.split('/').filter(|s| !s.is_empty()).collect()
}

fn shape(method: &str, segs: &[String]) -> String {
    let parts: Vec<&str> = segs.iter().map(|s| if s.starts_with(':') { ":" } else { s.as_str() }).collect();
    format!("{method} /{}", parts.join("/"))
}

fn json_error(status: u16, code: &str, message: &str) -> RawResponse {
    let mut r = RawResponse::new(status);
    r.body = serde_json::to_vec(&ErrorBody { code: code.into(), message: message.into(), path: String::new() }).unwrap();
    r.headers.set("Content-Type", "application/json");
    r
}

impl Server {
    pub fn new() -> Self {
        Self::default()
    }

    /// Call once at startup. Requests to endpoints that use a missing wrapper get 500.
    pub fn init(&self, wrappers: impl WrapperSet) -> &Self {
        *self.wrappers.write().unwrap() = wrappers.comatype_wrappers();
        self
    }

    /// Receiver for handler exceptions (panics) and causes of responses that do not match .comat. Defaults to standard error
    pub fn on_error(&self, f: impl Fn(&str) + Send + Sync + 'static) -> &Self {
        *self.on_error.write().unwrap() = Some(Box::new(f));
        self
    }

    fn report(&self, msg: &str) {
        match &*self.on_error.read().unwrap() {
            Some(f) => f(msg),
            None => eprintln!("[comatype] {msg}"),
        }
    }

    fn register<Arg, Req: 'static, Res: 'static>(
        &self,
        method: &str,
        ep: &'static Endpoint<Arg, Req, Res>,
        h: impl Fn(Req) -> Res + Send + Sync + 'static,
    ) -> &Self {
        assert!(ep.method == method, "s.{method}() に {} のエンドポイント（{}）は渡せません", ep.method, ep.module);
        let (Some(parse), Some(build)) = (ep.parse_request, ep.build_response) else {
            panic!("{} はサーバ用に生成されていません（role: server で生成してください）", ep.module);
        };
        let segs: Vec<String> = pathsegs(ep.path).into_iter().map(String::from).collect();
        let route = Route {
            method: ep.method,
            module: ep.module,
            statics: segs.iter().filter(|s| !s.starts_with(':')).count(),
            segs,
            wraps: ep.wraps,
            cache: ep.cache,
            handle: Box::new(move |raw| {
                let req = match parse(raw) {
                    Ok(r) => r,
                    Err(Error::Validation(v)) => {
                        let mut out = RawResponse::new(400);
                        out.body = serde_json::to_vec(&ErrorBody { code: "validation_error".into(), message: v.to_string(), path: v.path })
                            .unwrap();
                        out.headers.set("Content-Type", "application/json");
                        return out;
                    }
                    Err(e) => return RawResponse::error(&e.to_string()),
                };
                match build(h(req)) {
                    Ok(out) => out,
                    Err(e) => RawResponse::error(&e.to_string()),
                }
            }),
        };
        let mut routes = self.routes.write().unwrap();
        if let Some(o) = routes.iter().find(|o| shape(o.method, &o.segs) == shape(route.method, &route.segs)) {
            panic!("{} が重複しています（{} と {}）", shape(route.method, &route.segs), o.module, route.module);
        }
        routes.push(route);
        self
    }

    /// The route matching the path (more static segments wins).
    fn find<'a>(routes: &'a [Route], method: &str, segs: &[String]) -> Option<(&'a Route, BTreeMap<String, String>)> {
        let mut best: Option<(&Route, BTreeMap<String, String>)> = None;
        for r in routes {
            if r.method != method || r.segs.len() != segs.len() {
                continue;
            }
            let mut params = BTreeMap::new();
            let ok = r.segs.iter().zip(segs).all(|(want, got)| match want.strip_prefix(':') {
                Some(name) => {
                    params.insert(name.to_string(), got.clone());
                    true
                }
                None => want == got,
            });
            if ok && best.as_ref().is_none_or(|(b, _)| r.statics > b.statics) {
                best = Some((r, params));
            }
        }
        best
    }

    /// Handles one request. `target` is `/path?query`. The entry point to call from a framework.
    pub fn handle(&self, method: &str, target: &str, headers: crate::raw::Headers, body: Vec<u8>) -> RawResponse {
        let method = method.to_ascii_lowercase();
        let (path, query) = target.split_once('?').unwrap_or((target, ""));
        let mut segs = Vec::new();
        for s in pathsegs(path) {
            match percent_decode(s, false) {
                Some(d) => segs.push(d),
                None => return json_error(400, "bad_request", "path が不正です"),
            }
        }
        let routes = self.routes.read().unwrap();
        let Some((route, params)) = Self::find(&routes, &method, &segs) else {
            let mut allow: Vec<String> = Vec::new();
            for o in routes.iter() {
                if Self::find(&routes, o.method, &segs).is_some() && !allow.contains(&o.method.to_ascii_uppercase()) {
                    allow.push(o.method.to_ascii_uppercase());
                }
            }
            if !allow.is_empty() {
                allow.sort();
                let joined = allow.join(", ");
                let mut r = json_error(405, "method_not_allowed", &format!("使えるメソッド: {joined}"));
                r.headers.set("Allow", joined);
                return r;
            }
            return json_error(404, "not_found", path);
        };

        let mut raw = RawRequest::new(&method, path);
        raw.query = parse_query(query);
        raw.params = params;
        raw.body = body;
        for c in headers.get_all("Cookie") {
            for pair in c.split(';') {
                if let Some((k, v)) = pair.trim().split_once('=') {
                    raw.cookies.entry(k.to_string()).or_insert_with(|| percent_decode(v, false).unwrap_or_else(|| v.to_string()));
                }
            }
        }
        raw.headers = headers;

        // Cache (GET / QUERY, memory only; cookie caching is client-only). Looked up before the wrappers, so the key includes all headers (auth too)
        let cache_key = route.cache.filter(CacheSpec::memory).map(|_| server_cache_key(&method, target, &raw.headers, &raw.body));
        if let Some(k) = &cache_key {
            if let Some(hit) = self.cache.lock().unwrap().as_mut().and_then(|c| c.get(k)) {
                return hit;
            }
        }

        let ws = self.wrappers.read().unwrap();
        let mut chain: Vec<ServerWrap> = Vec::new();
        for name in route.wraps {
            match ws.get(name) {
                Some(w) => chain.push(w.clone()),
                None => {
                    self.report(&format!("ラッパー {name} が init に渡されていません（{}）", route.module));
                    return RawResponse::error("wrapper missing");
                }
            }
        }
        let resp = catch_unwind(AssertUnwindSafe(|| run(&chain, &route.handle, raw))).unwrap_or_else(|p| {
            let msg = p.downcast_ref::<String>().cloned().or_else(|| p.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
            RawResponse::error(&format!("panic: {msg}"))
        });
        if let Some(e) = &resp.err {
            self.report(&format!("{}: {e}", route.module));
        } else if let (Some(k), Some(spec)) = (&cache_key, route.cache) {
            if cacheable(&resp) {
                self.cache.lock().unwrap().get_or_insert_with(|| MemoryCache::new(1000)).set(k, &resp, spec.ttl_ms);
            }
        }
        resp
    }

    /// A simple server using only the standard library (a thread per connection). `addr` is e.g. `127.0.0.1:0`. Blocks.
    /// The actual address is passed to `on_listen`.
    pub fn serve(self: &Arc<Self>, addr: &str, on_listen: impl FnOnce(std::net::SocketAddr)) -> std::io::Result<()> {
        let listener = TcpListener::bind(addr)?;
        on_listen(listener.local_addr()?);
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let this = self.clone();
            std::thread::spawn(move || {
                let _ = this.connection(stream);
            });
        }
        Ok(())
    }

    fn connection(&self, stream: TcpStream) -> std::io::Result<()> {
        let mut rd = BufReader::new(stream.try_clone()?);
        let mut line = String::new();
        if rd.read_line(&mut line)? == 0 {
            return Ok(());
        }
        let mut parts = line.split_whitespace();
        let (Some(method), Some(target)) = (parts.next(), parts.next()) else { return Ok(()) };
        let (method, target) = (method.to_string(), target.to_string());
        let mut headers = crate::raw::Headers::new();
        loop {
            let mut l = String::new();
            if rd.read_line(&mut l)? == 0 || l.trim().is_empty() {
                break;
            }
            if let Some((k, v)) = l.trim_end().split_once(':') {
                headers.add(k.trim(), v.trim());
            }
        }
        let mut body = Vec::new();
        if headers.get("Transfer-Encoding").is_some_and(|v| v.eq_ignore_ascii_case("chunked")) {
            loop {
                let mut sz = String::new();
                rd.read_line(&mut sz)?;
                let n = usize::from_str_radix(sz.trim().split(';').next().unwrap_or("0"), 16).unwrap_or(0);
                if n == 0 {
                    break;
                }
                let mut buf = vec![0u8; n];
                rd.read_exact(&mut buf)?;
                body.extend(buf);
                rd.read_line(&mut String::new())?;
            }
        } else if let Some(n) = headers.get("Content-Length").and_then(|v| v.parse::<usize>().ok()) {
            body = vec![0u8; n];
            rd.read_exact(&mut body)?;
        }
        let resp = self.handle(&method, &target, headers, body);
        write_response(stream, &method, resp)
    }
}

fn run(chain: &[ServerWrap], handle: &Handle, req: RawRequest) -> RawResponse {
    match chain.split_first() {
        None => handle(&req),
        Some((w, rest)) => w(req, &|r| run(rest, handle, r)),
    }
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        422 => "Unprocessable Entity",
        500 => "Internal Server Error",
        _ => "Status",
    }
}

fn write_response(mut stream: TcpStream, method: &str, r: RawResponse) -> std::io::Result<()> {
    let no_body = matches!(r.status, 204 | 205 | 304) || method.eq_ignore_ascii_case("head");
    let mut head = format!("HTTP/1.1 {} {}\r\n", r.status, reason(r.status));
    for (k, v) in r.headers.iter() {
        if !k.eq_ignore_ascii_case("content-length") {
            head.push_str(&format!("{k}: {v}\r\n"));
        }
    }
    for c in &r.set_cookies {
        head.push_str(&format!("Set-Cookie: {c}\r\n"));
    }
    head.push_str(&format!("Content-Length: {}\r\nConnection: close\r\n\r\n", if no_body { 0 } else { r.body.len() }));
    stream.write_all(head.as_bytes())?;
    if !no_body {
        stream.write_all(&r.body)?;
    }
    stream.flush()
}

macro_rules! register_methods {
    ($($fn:ident => $m:expr),*) => {
        impl Server {$(
            pub fn $fn<Arg, Req: 'static, Res: 'static>(&self, ep: &'static Endpoint<Arg, Req, Res>, h: impl Fn(Req) -> Res + Send + Sync + 'static) -> &Self {
                self.register($m, ep, h)
            }
        )*}
    };
}
register_methods!(get => "get", post => "post", put => "put", patch => "patch", delete => "delete", options => "options", query => "query", head => "head");

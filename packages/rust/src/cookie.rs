//! cookies. Builds Set-Cookie from the `init.comat` settings (server) and a jar that keeps Set-Cookie (client).

use crate::error::{Error, Result};
use crate::wire::{percent_decode, percent_encode};
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// `cookie <name> { ... }` in `init.comat`.
#[derive(Debug, Clone, Copy)]
pub struct CookieDef {
    pub name: &'static str,
    pub http_only: bool,
    pub secure: bool,
    /// lax | strict | none
    pub same_site: Option<&'static str>,
    pub path: Option<&'static str>,
    pub domain: Option<&'static str>,
    /// seconds
    pub max_age: Option<i64>,
}

/// A cookie to issue.
#[derive(Debug, Clone, Default)]
pub struct CookieValue {
    pub value: String,
    pub delete: bool,
    pub max_age: Option<i64>,
    pub path: Option<String>,
    pub domain: Option<String>,
}

impl CookieValue {
    pub fn new(value: impl Into<String>) -> Self {
        CookieValue { value: value.into(), ..Default::default() }
    }
    /// Delete the cookie
    pub fn clear() -> Self {
        CookieValue { delete: true, ..Default::default() }
    }
    pub fn max_age(mut self, seconds: i64) -> Self {
        self.max_age = Some(seconds);
        self
    }
    pub fn path(mut self, p: impl Into<String>) -> Self {
        self.path = Some(p.into());
        self
    }
    pub fn domain(mut self, d: impl Into<String>) -> Self {
        self.domain = Some(d.into());
        self
    }
}

const EPOCH: &str = "Thu, 01 Jan 1970 00:00:00 GMT";

fn attr(what: &str, v: &str) -> Result<String> {
    if v.contains([';', '\r', '\n']) {
        return Err(Error::Internal(format!("cookie の {what} に使えない文字があります: {v:?}")));
    }
    Ok(v.to_string())
}

/// Builds a Set-Cookie value. Attributes (HttpOnly etc.) come from init.comat.
pub fn serialize_set_cookie(def: Option<&CookieDef>, v: &CookieValue) -> Result<String> {
    let def = def.ok_or_else(|| {
        Error::Internal("このエンドポイントは cookie を発行できません（cookie off、または init.comat に cookie の宣言がありません）".into())
    })?;
    let val = if v.delete { "" } else { &v.value };
    let mut parts = vec![format!("{}={}", def.name, percent_encode(val))];
    let path = v.path.as_deref().or(def.path).unwrap_or("/");
    parts.push(format!("Path={}", attr("path", path)?));
    if let Some(d) = v.domain.as_deref().or(def.domain) {
        parts.push(format!("Domain={}", attr("domain", d)?));
    }
    if v.delete {
        parts.push("Max-Age=0".into());
        parts.push(format!("Expires={EPOCH}"));
    } else if let Some(m) = v.max_age.or(def.max_age) {
        if m < 0 {
            return Err(Error::Internal(format!("cookie の maxAge が不正です: {m}")));
        }
        parts.push(format!("Max-Age={m}"));
    }
    if def.http_only {
        parts.push("HttpOnly".into());
    }
    if def.secure {
        parts.push("Secure".into());
    }
    if let Some(s) = def.same_site {
        let mut cs = s.chars();
        let cap = cs.next().map(|f| f.to_ascii_uppercase().to_string() + cs.as_str()).unwrap_or_default();
        parts.push(format!("SameSite={cap}"));
    }
    Ok(parts.join("; "))
}

struct Stored {
    value: String,
    path: String,
    expires: Option<Instant>,
}

/// A jar for HTTP clients that do not keep cookies.
/// Assumes the API is a single origin: ignores Domain and looks only at Path and expiry.
#[derive(Default)]
pub struct CookieJar {
    m: Mutex<BTreeMap<String, Stored>>,
}

impl CookieJar {
    pub fn new() -> Self {
        Self::default()
    }

    /// Cookies to send to this path.
    pub fn get(&self, path: &str) -> BTreeMap<String, String> {
        let mut m = self.m.lock().unwrap();
        let now = Instant::now();
        m.retain(|_, c| c.expires.is_none_or(|e| e > now));
        m.iter()
            .filter(|(_, c)| {
                let prefix = if c.path.ends_with('/') { c.path.clone() } else { format!("{}/", c.path) };
                c.path == "/" || path == c.path || path.starts_with(&prefix)
            })
            .map(|(k, c)| (k.clone(), c.value.clone()))
            .collect()
    }

    /// Takes in the response's Set-Cookie (Max-Age=0 deletes).
    pub fn store(&self, lines: &[String]) {
        let mut m = self.m.lock().unwrap();
        for line in lines {
            let mut segs = line.split(';');
            let Some((name, value)) = segs.next().and_then(|f| f.trim().split_once('=')) else { continue };
            if name.is_empty() {
                continue;
            }
            let mut c =
                Stored { value: percent_decode(value, false).unwrap_or_else(|| value.to_string()), path: "/".into(), expires: None };
            let mut max_age: Option<i64> = None;
            for a in segs {
                let (k, v) = a.trim().split_once('=').unwrap_or((a.trim(), ""));
                match k.to_ascii_lowercase().as_str() {
                    "path" if v.starts_with('/') => c.path = v.to_string(),
                    "max-age" => max_age = v.parse().ok(),
                    _ => {}
                }
            }
            match max_age {
                Some(n) if n <= 0 => {
                    m.remove(name);
                }
                Some(n) => {
                    c.expires = Some(Instant::now() + Duration::from_secs(n as u64));
                    m.insert(name.to_string(), c);
                }
                None => {
                    m.insert(name.to_string(), c);
                }
            }
        }
    }

    pub fn clear(&self) {
        self.m.lock().unwrap().clear();
    }
}

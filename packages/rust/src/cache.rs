//! Cache (`cache` in `.comat`): an in-memory TTL cache and the encoding used to store it in a cookie. GET / QUERY only.

use crate::raw::{Headers, RawResponse};
use crate::scalars::{base64_decode, base64_encode};
use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

/// Prefix of the names of cookies that hold a cache. The client does not send cookies with this name back to the server
pub const CACHE_COOKIE_PREFIX: &str = "comatype_cache_";
/// Maximum length of one cookie value. Larger responses are not cached in a cookie
pub const CACHE_COOKIE_MAX: usize = 3800;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheMode {
    /// Never cache
    Off,
    /// In memory, for ttl
    Memory,
    /// In a cookie, for ttl (client only)
    Cookie,
}

/// The `cache` setting.
#[derive(Debug, Clone, Copy)]
pub struct CacheSpec {
    pub mode: CacheMode,
    pub ttl_ms: u64,
}

impl CacheSpec {
    pub fn memory(&self) -> bool {
        self.mode == CacheMode::Memory && self.ttl_ms > 0
    }
    pub fn cookie(&self) -> bool {
        self.mode == CacheMode::Cookie && self.ttl_ms > 0
    }
}

/// In-memory cache with ttl (expired entries are dropped on lookup; when the size limit is exceeded, the oldest are dropped).
pub struct MemoryCache {
    max: usize,
    now: Box<dyn Fn() -> Instant + Send + Sync>,
    map: HashMap<String, (RawResponse, Instant)>,
    order: VecDeque<String>,
}

impl MemoryCache {
    pub fn new(max: usize) -> Self {
        Self::with_clock(max, Box::new(Instant::now))
    }

    pub fn with_clock(max: usize, now: Box<dyn Fn() -> Instant + Send + Sync>) -> Self {
        MemoryCache { max, now, map: HashMap::new(), order: VecDeque::new() }
    }

    pub fn get(&mut self, key: &str) -> Option<RawResponse> {
        let (res, exp) = self.map.get(key)?;
        if *exp <= (self.now)() {
            self.map.remove(key);
            self.order.retain(|k| k != key);
            return None;
        }
        Some(res.clone())
    }

    pub fn set(&mut self, key: &str, res: &RawResponse, ttl_ms: u64) {
        if self.map.insert(key.to_string(), (res.clone(), (self.now)() + Duration::from_millis(ttl_ms))).is_none() {
            self.order.push_back(key.to_string());
        }
        while self.map.len() > self.max {
            match self.order.pop_front() {
                Some(k) => {
                    self.map.remove(&k);
                }
                None => break,
            }
        }
    }

    pub fn clear(&mut self) {
        self.map.clear();
        self.order.clear();
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }
}

/// Whether a response may be cached (2xx and no Set-Cookie).
pub fn cacheable(res: &RawResponse) -> bool {
    (200..300).contains(&res.status) && res.set_cookies.is_empty()
}

/// Client cache key: method, URL (path and query) and body, plus the request headers declared in `.comat`.
/// Headers added by wrappers or init (Authorization etc.) are not included.
pub fn client_cache_key(method: &str, url: &str, body: &[u8], declared: &[&str], headers: &Headers) -> String {
    let mut names: Vec<String> = declared.iter().map(|n| n.to_ascii_lowercase()).collect();
    names.sort();
    let hs: Vec<String> = names.iter().map(|n| format!("{n}:{}", headers.get(n).unwrap_or(""))).collect();
    format!("{method}\n{url}\n{}\n\n{}", hs.join("\n"), String::from_utf8_lossy(body))
}

/// Server cache key: exact match of the request (method, path, query, all headers, body).
pub fn server_cache_key(method: &str, target: &str, headers: &Headers, body: &[u8]) -> String {
    let mut hs: Vec<String> = headers.iter().map(|(k, v)| format!("{}:{v}", k.to_ascii_lowercase())).collect();
    hs.sort();
    format!("{method}\n{target}\n{}\n\n{}", hs.join("\n"), String::from_utf8_lossy(body))
}

/// Builds a cookie name from a key (FNV-1a 64-bit).
pub fn cache_cookie_name(key: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in key.bytes() {
        h = (h ^ b as u64).wrapping_mul(0x100000001b3);
    }
    format!("{CACHE_COOKIE_PREFIX}{h:016x}")
}

/// Encodes a response as a cookie value (base64url of `status\nname\tvalue\n...\n\nbody`). None if too large.
pub fn encode_cache_cookie(res: &RawResponse) -> Option<String> {
    let mut head = format!("{}\n", res.status);
    for (k, v) in res.headers.iter() {
        head.push_str(&format!("{k}\t{v}\n"));
    }
    let mut bytes = head.into_bytes();
    bytes.push(b'\n');
    bytes.extend_from_slice(&res.body);
    let v = base64_encode(&bytes).trim_end_matches('=').replace('+', "-").replace('/', "_");
    (v.len() <= CACHE_COOKIE_MAX).then_some(v)
}

pub fn decode_cache_cookie(value: &str) -> Option<RawResponse> {
    let std = value.replace('-', "+").replace('_', "/");
    let raw = base64_decode(&std)?;
    let pos = raw.windows(2).position(|w| w == b"\n\n")?;
    let head = String::from_utf8(raw[..pos].to_vec()).ok()?;
    let mut lines = head.split('\n');
    let mut out = RawResponse::new(lines.next()?.parse().ok()?);
    out.body = raw[pos + 2..].to_vec();
    for l in lines {
        if let Some((k, v)) = l.split_once('\t') {
            out.headers.add(k, v);
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_cache_ttl_and_limit() {
        use std::sync::{Arc, Mutex};
        let t0 = Instant::now();
        let off = Arc::new(Mutex::new(Duration::ZERO));
        let o = off.clone();
        let mut c = MemoryCache::with_clock(2, Box::new(move || t0 + *o.lock().unwrap()));
        let mut r = RawResponse::new(200);
        r.body = b"1".to_vec();
        c.set("a", &r, 100);
        assert_eq!(c.get("a").unwrap().body, b"1");
        *off.lock().unwrap() += Duration::from_millis(101);
        assert!(c.get("a").is_none());
        for k in ["a", "b", "c"] {
            c.set(k, &r, 1000);
        }
        assert!(c.get("a").is_none() && c.get("c").is_some());
    }

    #[test]
    fn cookie_roundtrip() {
        let mut r = RawResponse::new(200);
        r.headers.add("X-A", "あ");
        r.body = br#"{"n":1}"#.to_vec();
        let v = encode_cache_cookie(&r).unwrap();
        assert!(!v.contains(['=', ';', ',', ' ']));
        let got = decode_cache_cookie(&v).unwrap();
        assert_eq!((got.status, got.headers.get("x-a"), got.body.as_slice()), (200, Some("あ"), &br#"{"n":1}"#[..]));
        let mut big = RawResponse::new(200);
        big.body = vec![b'x'; 5000];
        assert!(encode_cache_cookie(&big).is_none());
        assert!(decode_cache_cookie("!!!").is_none());
        assert_eq!(cache_cookie_name("k").len(), CACHE_COOKIE_PREFIX.len() + 16);
    }

    #[test]
    fn keys() {
        let mut h1 = Headers::new();
        h1.set("x-v", "1");
        h1.set("authorization", "a");
        let mut h2 = Headers::new();
        h2.set("x-v", "1");
        h2.set("authorization", "b");
        assert_eq!(client_cache_key("get", "u", b"", &["X-V"], &h1), client_cache_key("get", "u", b"", &["X-V"], &h2));
        assert_ne!(server_cache_key("get", "/n", &h1, b""), server_cache_key("get", "/n", &h2, b""));
    }
}

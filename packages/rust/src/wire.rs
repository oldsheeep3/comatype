//! Conversion between the wire shape (path, query, headers, body) and Rust values. Used by generated code.

use crate::error::{fail_path, Error, Result, ValidationError};
use crate::raw::{RawRequest, RawResponse};
use crate::scalars::*;
use crate::validate::Validate;
use serde::{de::DeserializeOwned, Serialize};

/// Values that can go in path, query and headers (scalars, and arrays / optionals of them).
pub trait Wire: Sized {
    /// Whether the type is optional (`Option<T>`)
    const OPTIONAL: bool = false;
    fn to_wire(&self) -> Vec<String>;
    /// `split` is for headers: an array arrives as one ", "-separated value
    fn from_wire(vals: &[String], split: bool) -> std::result::Result<Self, String>;
}

macro_rules! wire_string {
    ($($t:ty),*) => {$(
        impl Wire for $t {
            fn to_wire(&self) -> Vec<String> { vec![self.0.clone()] }
            fn from_wire(vals: &[String], _: bool) -> std::result::Result<Self, String> {
                vals.first().map(|s| <$t>::new(s.clone())).ok_or_else(|| "必須です".to_string())
            }
        }
    )*};
}
wire_string!(Email, Phone, Uuid, Uuidv4, Uuidv7, Date, Time, DateTime, Decimal, Url);

impl Wire for String {
    fn to_wire(&self) -> Vec<String> {
        vec![self.clone()]
    }
    fn from_wire(vals: &[String], _: bool) -> std::result::Result<Self, String> {
        vals.first().cloned().ok_or_else(|| "必須です".to_string())
    }
}

impl Wire for bool {
    fn to_wire(&self) -> Vec<String> {
        vec![self.to_string()]
    }
    fn from_wire(vals: &[String], _: bool) -> std::result::Result<Self, String> {
        match vals.first().map(String::as_str) {
            Some("true") => Ok(true),
            Some("false") => Ok(false),
            Some(_) => Err("真偽値は true か false にしてください".into()),
            None => Err("必須です".into()),
        }
    }
}

impl Wire for i64 {
    fn to_wire(&self) -> Vec<String> {
        vec![self.to_string()]
    }
    fn from_wire(vals: &[String], _: bool) -> std::result::Result<Self, String> {
        vals.first().ok_or_else(|| "必須です".to_string())?.trim().parse().map_err(|_| "整数ではありません".to_string())
    }
}

impl Wire for Int64 {
    fn to_wire(&self) -> Vec<String> {
        vec![self.0.to_string()]
    }
    fn from_wire(vals: &[String], _: bool) -> std::result::Result<Self, String> {
        vals.first().ok_or_else(|| "必須です".to_string())?.trim().parse().map(Int64).map_err(|_| "整数ではありません".to_string())
    }
}

impl<T: Wire> Wire for Option<T> {
    const OPTIONAL: bool = true;
    fn to_wire(&self) -> Vec<String> {
        self.as_ref().map(Wire::to_wire).unwrap_or_default()
    }
    fn from_wire(vals: &[String], split: bool) -> std::result::Result<Self, String> {
        if vals.is_empty() {
            Ok(None)
        } else {
            T::from_wire(vals, split).map(Some)
        }
    }
}

impl<T: Wire> Wire for Vec<T> {
    fn to_wire(&self) -> Vec<String> {
        self.iter().flat_map(Wire::to_wire).collect()
    }
    fn from_wire(vals: &[String], split: bool) -> std::result::Result<Self, String> {
        let items: Vec<String> = if split && vals.len() == 1 {
            if vals[0].trim().is_empty() {
                vec![]
            } else {
                vals[0].split(',').map(|p| p.trim().to_string()).collect()
            }
        } else {
            vals.to_vec()
        };
        items.iter().map(|s| T::from_wire(std::slice::from_ref(s), false)).collect()
    }
}

/// Reads the value named `name` as `T`. If missing: None for optional types, otherwise "required".
pub fn read<T: Wire>(vals: &[String], name: &str, split: bool) -> Result<T> {
    if vals.is_empty() && !T::OPTIONAL {
        return Err(fail_path(name, "必須です"));
    }
    T::from_wire(vals, split).map_err(|e| fail_path(name, e))
}

// ---- percent encoding ----

pub fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// `+` is kept as is (path / cookie). Only for `form` is `+` turned into a space
pub fn percent_decode(s: &str, form: bool) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' => {
                let h = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
                out.push(u8::from_str_radix(h, 16).ok()?);
                i += 3;
            }
            b'+' if form => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

pub fn parse_query(q: &str) -> Vec<(String, String)> {
    q.split('&')
        .filter(|p| !p.is_empty())
        .map(|p| {
            let (k, v) = p.split_once('=').unwrap_or((p, ""));
            (percent_decode(k, true).unwrap_or_else(|| k.to_string()), percent_decode(v, true).unwrap_or_else(|| v.to_string()))
        })
        .collect()
}

// ---- Build the request (client) ----

/// Fills in the `:name` parts of the path.
pub fn fill_path(raw: &mut RawRequest, params: &[(&str, Vec<String>)]) -> Result<()> {
    let segs: Vec<String> = raw
        .path
        .split('/')
        .map(|s| match s.strip_prefix(':') {
            None => Ok(s.to_string()),
            Some(name) => {
                let v = params.iter().find(|(n, _)| *n == name).and_then(|(_, v)| v.first()).filter(|v| !v.is_empty());
                let v = v.ok_or_else(|| fail_path(name, "必須です"))?;
                raw.params.insert(name.to_string(), v.clone());
                Ok(percent_encode(v))
            }
        })
        .collect::<Result<_>>()?;
    raw.path = segs.join("/");
    Ok(())
}

pub fn add_query(raw: &mut RawRequest, items: &[(&str, Vec<String>)]) {
    for (k, vs) in items {
        for v in vs {
            raw.query.push((k.to_string(), v.clone()));
        }
    }
}

pub fn set_headers(headers: &mut crate::raw::Headers, items: &[(&str, Vec<String>)]) {
    for (k, vs) in items {
        if !vs.is_empty() {
            headers.set(k, vs.join(", "));
        }
    }
}

// ---- JSON ----

/// Reads JSON and validates required fields, types and constraints.
pub fn decode<T: DeserializeOwned + Validate>(data: &[u8]) -> std::result::Result<T, ValidationError> {
    let v: T = serde_json::from_slice(data).map_err(|e| {
        let msg = e.to_string();
        let path = msg.strip_prefix("missing field `").and_then(|r| r.split('`').next()).unwrap_or("");
        let reason = if path.is_empty() { format!("JSON として読めません: {msg}") } else { "必須です".to_string() };
        ValidationError::new(path, reason)
    })?;
    v.validate("")?;
    Ok(v)
}

/// Validates, then turns into JSON.
pub fn encode<T: Serialize + Validate>(v: &T) -> std::result::Result<Vec<u8>, ValidationError> {
    v.validate("")?;
    serde_json::to_vec(v).map_err(|e| ValidationError::new("", e.to_string()))
}

pub fn set_body<T: Serialize + Validate>(raw: &mut RawRequest, body: &T) -> Result<()> {
    raw.body = encode(body)?;
    raw.headers.set("Content-Type", "application/json");
    Ok(())
}

pub fn get_body<T: DeserializeOwned + Validate>(raw: &RawRequest) -> Result<T> {
    if raw.body.is_empty() {
        return Err(fail_path("body", "必須です"));
    }
    decode(&raw.body).map_err(|mut e| {
        e.path = crate::error::join("body", &e.path);
        Error::Validation(e)
    })
}

/// Reads the response body. None if the body is empty.
pub fn decode_response_body<T: DeserializeOwned + Validate>(raw: &RawResponse) -> Result<Option<T>> {
    if raw.body.is_empty() {
        return Ok(None);
    }
    Ok(Some(decode(&raw.body)?))
}

pub fn set_response_body<T: Serialize + Validate>(out: &mut RawResponse, body: &T) -> Result<()> {
    out.body = encode(body)?;
    out.headers.set("Content-Type", "application/json");
    Ok(())
}

// ---- Take out the received values (server; client response headers) ----

pub fn param_values(raw: &RawRequest, name: &str) -> Vec<String> {
    raw.params.get(name).cloned().into_iter().collect()
}

pub fn query_values(raw: &RawRequest, name: &str) -> Vec<String> {
    raw.query_all(name).into_iter().map(String::from).collect()
}

pub fn header_values(headers: &crate::raw::Headers, name: &str) -> Vec<String> {
    headers.get_all(name).into_iter().map(String::from).collect()
}

/// For generated code to get a function that looks up a value by name
pub fn param_values_of(raw: &RawRequest) -> impl Fn(&str) -> Vec<String> + '_ {
    move |n| param_values(raw, n)
}
pub fn query_values_of(raw: &RawRequest) -> impl Fn(&str) -> Vec<String> + '_ {
    move |n| query_values(raw, n)
}
pub fn request_header_values_of(raw: &RawRequest) -> impl Fn(&str) -> Vec<String> + '_ {
    move |n| header_values(&raw.headers, n)
}
pub fn header_values_of(raw: &RawResponse) -> impl Fn(&str) -> Vec<String> + '_ {
    move |n| header_values(&raw.headers, n)
}

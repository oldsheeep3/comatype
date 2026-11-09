//! Conversion of URIs, paths and character positions (LSP uses UTF-16 units).

use std::path::{Path, PathBuf};

pub fn normalize(p: &Path) -> PathBuf {
    p.canonicalize().unwrap_or_else(|_| p.to_path_buf())
}

pub fn path_to_uri(p: &Path) -> String {
    let mut out = String::from("file://");
    for b in p.to_string_lossy().bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub fn uri_to_path(uri: &str) -> Option<PathBuf> {
    let rest = uri.strip_prefix("file://")?;
    let rest = rest.strip_prefix("localhost").unwrap_or(rest);
    let bytes = rest.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok().map(PathBuf::from)
}

/// Position of a character (char) in a line → UTF-16 position
pub fn char_to_utf16(line: &str, col: usize) -> usize {
    line.chars().take(col).map(char::len_utf16).sum()
}

/// UTF-16 position in a line → position of a character (char)
pub fn utf16_to_char(line: &str, utf16: usize) -> usize {
    let mut units = 0;
    for (i, c) in line.chars().enumerate() {
        if units >= utf16 {
            return i;
        }
        units += c.len_utf16();
    }
    line.chars().count()
}

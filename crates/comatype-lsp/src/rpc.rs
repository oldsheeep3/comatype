//! JSON-RPC 2.0 reading and writing (with Content-Length).

use serde_json::Value;
use std::io::{self, BufRead, Write};

/// Reads one message. None when the input is closed
pub fn read_message(input: &mut impl BufRead) -> io::Result<Option<Value>> {
    let mut len: Option<usize> = None;
    loop {
        let mut line = String::new();
        if input.read_line(&mut line)? == 0 {
            return Ok(None);
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some(v) = line.strip_prefix("Content-Length:") {
            len = v.trim().parse().ok();
        }
    }
    let Some(len) = len else {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "missing Content-Length"));
    };
    let mut buf = vec![0u8; len];
    input.read_exact(&mut buf)?;
    serde_json::from_slice(&buf).map(Some).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

pub fn write_message(out: &mut impl Write, msg: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(msg)?;
    write!(out, "Content-Length: {}\r\n\r\n", body.len())?;
    out.write_all(&body)?;
    out.flush()
}

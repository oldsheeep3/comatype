//! Diagnostic output. `[error] location  message` / `[warn]  location  message` / `[info]  message`.
//! Location (file:line:col) and message are colored so they can be told apart (only on a terminal; `--color` / `--no-color` / `NO_COLOR`).

use comatype_core::diag::{Diagnostic, Severity};
use std::sync::OnceLock;

static COLOR: OnceLock<bool> = OnceLock::new();

/// Called once at startup. `flag` is `--color` (Some(true)) / `--no-color` (Some(false))
pub fn init(flag: Option<bool>) {
    use std::io::IsTerminal;
    let on = flag.unwrap_or_else(|| std::io::stderr().is_terminal() && std::env::var_os("NO_COLOR").is_none());
    let _ = COLOR.set(on);
}

fn on() -> bool {
    COLOR.get().copied().unwrap_or(false)
}

fn paint(s: &str, code: &str) -> String {
    if on() {
        format!("\x1b[{code}m{s}\x1b[0m")
    } else {
        s.to_string()
    }
}

/// Aligns the width of the tag (`[error]` is the longest)
fn tag(level: &str) -> String {
    let (text, code) = match level {
        "error" => ("[error]", "1;31"),
        "warn" => ("[warn] ", "1;33"),
        _ => ("[info] ", "1;36"),
    };
    paint(text, code)
}

pub fn format_diag(d: &Diagnostic) -> String {
    let (level,) = match d.severity {
        Severity::Error => ("error",),
        Severity::Warning => ("warn",),
    };
    let loc = if d.line == 0 { d.file.clone() } else { format!("{}:{}:{}", d.file, d.line, d.col) };
    format!("{} {}  {}", tag(level), paint(&loc, "1;4;36"), d.message)
}

pub fn print(d: &Diagnostic) {
    eprintln!("{}", format_diag(d));
}

pub fn info(msg: &str) {
    eprintln!("{} {msg}", tag("info"));
}

pub fn error(msg: &str) {
    eprintln!("{} {msg}", tag("error"));
}

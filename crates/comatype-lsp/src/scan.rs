//! Scans text line by line and extracts the positions of declarations, imports and words.
//!
//! The syntax tree is not used so that go to definition and completion work mid-typing too (in files with syntax errors).
//! Positions: lines are 0-based, columns count characters (char).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeclKind {
    Type,
    Enum,
    Wrapper,
}

#[derive(Debug, Clone)]
pub struct Decl {
    pub name: String,
    pub kind: DeclKind,
    pub line: usize,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone)]
pub struct ImportName {
    pub name: String,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone)]
pub struct Import {
    pub line: usize,
    pub names: Vec<ImportName>,
    pub path: String,
    pub path_start: usize,
    pub path_end: usize,
}

/// Words that cannot be the first word of a type declaration
const KEYWORDS: &[&str] = &[
    "import", "enum", "path", "params", "search", "body", "header", "headerReq", "headerRes", "wrap", "cookie", "cache", "baseUrl", "wrapper", "ctx",
];

pub const BUILTIN_TYPES: &[&str] = &[
    "string", "bool", "int", "email", "phone", "uuid", "uuidv4", "uuidv7", "date", "datetime", "time", "int64", "decimal", "url", "bytes",
    "json",
];

pub fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_'
}

pub fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

pub fn is_status_code(w: &str) -> bool {
    w.len() == 4 && w.starts_with('s') && w[1..].chars().all(|c| c.is_ascii_digit())
}

fn is_comment(line: &str) -> bool {
    line.trim_start().starts_with("//")
}

/// The identifier at the start of `chars[from..]` (after skipping whitespace). (start, end, string)
fn ident_after(chars: &[char], mut from: usize) -> Option<(usize, usize, String)> {
    while from < chars.len() && chars[from].is_whitespace() {
        from += 1;
    }
    if from >= chars.len() || !is_ident_start(chars[from]) {
        return None;
    }
    let mut end = from;
    while end < chars.len() && is_ident_char(chars[end]) {
        end += 1;
    }
    Some((from, end, chars[from..end].iter().collect()))
}

/// The identifier at cursor (character position) in a line
pub fn word_at(line: &str, col: usize) -> Option<(usize, usize, String)> {
    let chars: Vec<char> = line.chars().collect();
    if chars.is_empty() {
        return None;
    }
    let mut c = col.min(chars.len());
    // A cursor right after the end of a word also points to that word
    if c == chars.len() || !is_ident_char(chars[c]) {
        if c > 0 && is_ident_char(chars[c - 1]) {
            c -= 1;
        } else {
            return None;
        }
    }
    let mut s = c;
    while s > 0 && is_ident_char(chars[s - 1]) {
        s -= 1;
    }
    let mut e = c;
    while e < chars.len() && is_ident_char(chars[e]) {
        e += 1;
    }
    if !is_ident_start(chars[s]) {
        return None;
    }
    Some((s, e, chars[s..e].iter().collect()))
}

pub fn scan_decls(text: &str) -> Vec<Decl> {
    let mut out = Vec::new();
    for (i, line) in text.lines().enumerate() {
        if is_comment(line) {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let Some((s, e, first)) = ident_after(&chars, 0) else { continue };
        match first.as_str() {
            "enum" | "wrapper" => {
                if let Some((ns, ne, name)) = ident_after(&chars, e) {
                    let kind = if first == "enum" { DeclKind::Enum } else { DeclKind::Wrapper };
                    out.push(Decl { name, kind, line: i, start: ns, end: ne });
                }
            }
            w if KEYWORDS.contains(&w) || is_status_code(w) || BUILTIN_TYPES.contains(&w) => {}
            _ => {
                // `Name {` (the brace is on the same line)
                let rest: String = chars[e..].iter().collect();
                if rest.trim_start().starts_with('{') {
                    out.push(Decl { name: first, kind: DeclKind::Type, line: i, start: s, end: e });
                }
            }
        }
    }
    out
}

pub fn scan_imports(text: &str) -> Vec<Import> {
    let mut out = Vec::new();
    for (i, line) in text.lines().enumerate() {
        if is_comment(line) {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let Some((_, mut pos, first)) = ident_after(&chars, 0) else { continue };
        if first != "import" {
            continue;
        }
        let mut names = Vec::new();
        loop {
            let Some((s, e, name)) = ident_after(&chars, pos) else { break };
            if name == "from" && !names.is_empty() {
                // `from` after the name
                pos = e;
                while pos < chars.len() && chars[pos].is_whitespace() {
                    pos += 1;
                }
                let mut pe = pos;
                while pe < chars.len() && !chars[pe].is_whitespace() {
                    pe += 1;
                }
                if pe > pos {
                    out.push(Import { line: i, names, path: chars[pos..pe].iter().collect(), path_start: pos, path_end: pe });
                }
                break;
            }
            names.push(ImportName { name, start: s, end: e });
            pos = e;
            while pos < chars.len() && chars[pos].is_whitespace() {
                pos += 1;
            }
            if pos < chars.len() && chars[pos] == ',' {
                pos += 1;
            }
        }
    }
    out
}

/// Body of a declaration (from `Name {` to the matching `}`). Cut off midway if too long
pub fn decl_source(text: &str, d: &Decl, max_lines: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut depth = 0i32;
    let mut seen_open = false;
    let mut out = Vec::new();
    for (n, line) in lines.iter().enumerate().skip(d.line).take(max_lines) {
        out.push(*line);
        for c in line.chars() {
            match c {
                '{' => {
                    depth += 1;
                    seen_open = true;
                }
                '}' => depth -= 1,
                _ => {}
            }
        }
        let _ = n;
        if seen_open && depth <= 0 {
            break;
        }
    }
    out.join("\n")
}

//! The LSP server itself: state (open documents), diagnostics, go to definition, hover, symbols, completion.

use crate::rpc::{read_message, write_message};
use crate::scan::*;
use crate::util::*;
use comatype_core::parser;
use comatype_core::status::{self, StatusTable};
use comatype_core::project::check_config_with_overlay;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

const CONFIG_NAME: &str = "comatype.config.json";

struct Doc {
    uri: String,
    text: String,
}

pub struct Server<'a, W: Write> {
    out: &'a mut W,
    docs: HashMap<PathBuf, Doc>,
    /// Config file → files that got diagnostics (to republish empty diagnostics for files that are fixed)
    published: HashMap<PathBuf, HashSet<PathBuf>>,
    /// Standalone files with no config file, checked for syntax only
    standalone: HashSet<PathBuf>,
    shutdown: bool,
}

/// Handles LSP over stdin / stdout etc. Returns the exit code (0 for exit after shutdown)
pub fn run(input: &mut impl BufRead, output: &mut impl Write) -> io::Result<i32> {
    let mut s = Server { out: output, docs: HashMap::new(), published: HashMap::new(), standalone: HashSet::new(), shutdown: false };
    while let Some(msg) = read_message(input)? {
        if let Some(code) = s.handle(&msg)? {
            return Ok(code);
        }
    }
    Ok(1)
}

fn find_config(start: &Path) -> Option<PathBuf> {
    let mut dir = Some(start);
    while let Some(d) = dir {
        let c = d.join(CONFIG_NAME);
        if c.is_file() {
            return Some(c);
        }
        dir = d.parent();
    }
    None
}

fn find_init(from_file: &Path) -> Option<PathBuf> {
    let mut dir = from_file.parent();
    while let Some(d) = dir {
        let c = d.join("init.comat");
        if c.is_file() {
            return Some(c);
        }
        if d.join(CONFIG_NAME).is_file() {
            return None;
        }
        dir = d.parent();
    }
    None
}

fn keyword_doc(w: &str) -> Option<&'static str> {
    Some(match w {
        "string" => "**string** — 文字列。`string(1..50)`（文字数）、`string(pattern: \"...\")`（正規表現）",
        "bool" => "**bool** — 真偽値",
        "int" => "**int** — 整数（JSON の数値）。`int(0..150)` で範囲",
        "email" => "**email** — メールアドレス（文字列）",
        "phone" => "**phone** — 電話番号（E.164。文字列）",
        "uuid" => "**uuid** — UUID（バージョン不問。文字列）",
        "uuidv4" => "**uuidv4** — UUID v4（文字列）",
        "uuidv7" => "**uuidv7** — UUID v7（時刻順に並ぶ。文字列）",
        "date" => "**date** — 日付 `YYYY-MM-DD`",
        "datetime" => "**datetime** — RFC 3339（タイムゾーン付き）",
        "time" => "**time** — 時刻 `HH:MM:SS`",
        "int64" => "**int64** — 64 ビット整数。通信上は**文字列**（JavaScript で 2^53 を超えると精度が落ちるため）",
        "decimal" => "**decimal** — 小数（金額など）。通信上は**文字列**",
        "url" => "**url** — URL（文字列）",
        "bytes" => "**bytes** — base64 の文字列",
        "json" => "**json** — 任意の JSON",
        "null" => "**null** — `T | null` で、null を許す",
        "none" => "**none** — レスポンスのボディなし（`s204 none`）",
        "empty" => "**empty** — フィールドごと省略する（`uid: empty`。`...Type` で展開したフィールドを消す）",
        "path" => "**path** — path の明示（非推奨）。`/fix/path` は固定、`./relative` はディレクトリからの相対",
        "params" => "**params** — path パラメータの型（`[id]` / `:id` / `__id` のディレクトリ名・ファイル名に対応）",
        "search" => "**search** — クエリ文字列の型",
        "body" => "**body** — リクエストのボディの型（エンドポイントに 1 つ）",
        "header" => "**header** — リクエストとレスポンスの両方のヘッダ",
        "headerReq" => "**headerReq** — リクエストだけのヘッダ",
        "headerRes" => "**headerRes** — レスポンスだけのヘッダ",
        "wrap" => "**wrap** — ラッパーを有効にする。`wrap auth off` で無効にする",
        "cookie" => "**cookie** — `cookie on|off`（エンドポイント）、`cookie session { ... }`（init.comat）",
        "cache" => "**cache** — `cache off`（強制的にキャッシュしない）、`cache 5000`（ttl ミリ秒だけメモリにキャッシュ）、`cache 5000 cookie`（cookie にキャッシュ。クライアントのみ）。GET / QUERY のエンドポイントだけ。defaults.comat / init.comat では無視される",
        "baseUrl" => "**baseUrl** — 全エンドポイントの base url（init.comat）",
        "wrapper" => "**wrapper** — ラッパーの宣言（init.comat）。ctx の型と、返せるステータス",
        "ctx" => "**ctx** — ラッパーがハンドラに渡す値の型",
        "import" => "**import** — 別のファイルの型を使う。`import Name from ../types/Name.comat`",
        "enum" => "**enum** — 文字列の値の一覧",
        _ => return None,
    })
}

impl<'a, W: Write> Server<'a, W> {
    fn send(&mut self, v: Value) -> io::Result<()> {
        write_message(self.out, &v)
    }

    fn respond(&mut self, id: &Value, result: Value) -> io::Result<()> {
        self.send(json!({"jsonrpc": "2.0", "id": id, "result": result}))
    }

    fn respond_err(&mut self, id: &Value, code: i64, message: &str) -> io::Result<()> {
        self.send(json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}}))
    }

    fn text_of(&self, path: &Path) -> Option<String> {
        match self.docs.get(&normalize(path)) {
            Some(d) => Some(d.text.clone()),
            None => std::fs::read_to_string(path).ok(),
        }
    }

    /// Status codes usable in the project this path belongs to (standard + additionalStatusCodes)
    fn status_table(&self, path: &Path) -> StatusTable {
        let config = normalize(path).parent().and_then(find_config);
        match config.and_then(|c| comatype_core::config::load(&c).ok()) {
            Some((cfg, _)) => cfg.status_table(),
            None => status::builtin_table(),
        }
    }

    fn uri_of(&self, path: &Path) -> String {
        self.docs.get(&normalize(path)).map(|d| d.uri.clone()).unwrap_or_else(|| path_to_uri(path))
    }

    /// Handles one message. Some(exit code) if it should exit
    fn handle(&mut self, msg: &Value) -> io::Result<Option<i32>> {
        let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
        let id = msg.get("id").cloned();
        let params = msg.get("params").cloned().unwrap_or(Value::Null);
        match (method, id) {
            ("initialize", Some(id)) => self.respond(&id, capabilities())?,
            ("shutdown", Some(id)) => {
                self.shutdown = true;
                self.respond(&id, Value::Null)?
            }
            ("exit", _) => return Ok(Some(if self.shutdown { 0 } else { 1 })),
            ("textDocument/didOpen", None) => {
                let d = &params["textDocument"];
                if let (Some(uri), Some(text)) = (d["uri"].as_str(), d["text"].as_str()) {
                    if let Some(path) = uri_to_path(uri) {
                        self.docs.insert(normalize(&path), Doc { uri: uri.to_string(), text: text.to_string() });
                        self.analyze(&path)?;
                    }
                }
            }
            ("textDocument/didChange", None) => {
                let uri = params["textDocument"]["uri"].as_str().unwrap_or("");
                // The server is configured to receive the full text (TextDocumentSyncKind.Full), so the last change is the full text
                let text = params["contentChanges"].as_array().and_then(|a| a.last()).and_then(|c| c["text"].as_str());
                if let (Some(path), Some(text)) = (uri_to_path(uri), text) {
                    self.docs.insert(normalize(&path), Doc { uri: uri.to_string(), text: text.to_string() });
                    self.analyze(&path)?;
                }
            }
            ("textDocument/didSave", None) => {
                if let Some(path) = params["textDocument"]["uri"].as_str().and_then(uri_to_path) {
                    self.analyze(&path)?;
                }
            }
            ("textDocument/didClose", None) => {
                if let Some(path) = params["textDocument"]["uri"].as_str().and_then(uri_to_path) {
                    self.docs.remove(&normalize(&path));
                    if self.standalone.remove(&normalize(&path)) {
                        let uri = path_to_uri(&path);
                        self.publish(&uri, vec![])?;
                    } else {
                        self.analyze(&path)?; // Check again with the content on disk
                    }
                }
            }
            (m @ ("textDocument/definition" | "textDocument/hover" | "textDocument/documentSymbol" | "textDocument/completion"), Some(id)) => {
                let result = self.request(m, &params);
                self.respond(&id, result)?
            }
            (_, Some(id)) => self.respond_err(&id, -32601, &format!("未対応のメソッド: {method}"))?,
            _ => {} // Unsupported notifications (initialized, $/cancelRequest, etc.) are ignored
        }
        Ok(None)
    }

    fn request(&self, method: &str, params: &Value) -> Value {
        let Some(path) = params["textDocument"]["uri"].as_str().and_then(uri_to_path) else { return Value::Null };
        if method == "textDocument/documentSymbol" {
            return self.document_symbols(&path);
        }
        let line = params["position"]["line"].as_u64().unwrap_or(0) as usize;
        let character = params["position"]["character"].as_u64().unwrap_or(0) as usize;
        let Some(text) = self.text_of(&path) else { return Value::Null };
        let line_text = text.lines().nth(line).unwrap_or("");
        let col = utf16_to_char(line_text, character);
        match method {
            "textDocument/definition" => self.definition(&path, &text, line, col).unwrap_or(Value::Null),
            "textDocument/hover" => self.hover(&path, &text, line, col).unwrap_or(Value::Null),
            _ => self.completion(&path, &text, line, col),
        }
    }

    // ---- Diagnostics ----

    fn publish(&mut self, uri: &str, diagnostics: Vec<Value>) -> io::Result<()> {
        self.send(json!({"jsonrpc": "2.0", "method": "textDocument/publishDiagnostics", "params": {"uri": uri, "diagnostics": diagnostics}}))
    }

    fn lsp_diag(&self, file: &Path, line1: usize, col1: usize, error: bool, message: &str) -> Value {
        let text = self.text_of(file).unwrap_or_default();
        let line = line1.saturating_sub(1);
        let line_text = text.lines().nth(line).unwrap_or("");
        let start = col1.saturating_sub(1).min(line_text.chars().count());
        let end = match word_at(line_text, start) {
            Some((s, e, _)) if s == start => e,
            _ => (start + 1).min(line_text.chars().count()),
        };
        json!({
            "range": {
                "start": {"line": line, "character": char_to_utf16(line_text, start)},
                "end": {"line": line, "character": char_to_utf16(line_text, end.max(start))},
            },
            "severity": if error { 1 } else { 2 },
            "source": "comatype",
            "message": message,
        })
    }

    /// The file at path changed, so check the project it belongs to again and publish diagnostics
    fn analyze(&mut self, path: &Path) -> io::Result<()> {
        let path = normalize(path);
        let Some(config) = path.parent().and_then(find_config) else {
            // There is no config file, so check only this file's syntax
            self.standalone.insert(path.clone());
            let uri = self.uri_of(&path);
            let text = self.text_of(&path).unwrap_or_default();
            let diags = match parser::parse(&path.display().to_string(), &text) {
                Ok(_) => vec![],
                Err(d) => vec![self.lsp_diag(&path, d.line, d.col, true, &d.message)],
            };
            return self.publish(&uri, diags);
        };
        let config = normalize(&config);
        let base = config.parent().map(Path::to_path_buf).unwrap_or_default();
        let overlay: HashMap<PathBuf, String> = self.docs.iter().map(|(p, d)| (p.clone(), d.text.clone())).collect();
        let res = check_config_with_overlay(&config, None, &overlay);

        // While there is a syntax error, do not publish semantic check results (type not found, etc.) (so the whole screen does not turn red mid-typing)
        let any_syntax = res.diagnostics.iter().any(|d| d.syntax);
        let mut by_file: HashMap<PathBuf, Vec<Value>> = HashMap::new();
        for d in res.diagnostics.iter().filter(|d| !any_syntax || d.syntax) {
            let file = normalize(&base.join(&d.file));
            let v = self.lsp_diag(&file, d.line, d.col, d.is_error(), &d.message);
            by_file.entry(file).or_default().push(v);
        }
        // Open files get an empty publish even without diagnostics, to clear stale markers
        let mut touched: HashSet<PathBuf> = by_file.keys().cloned().collect();
        touched.extend(self.docs.keys().filter(|p| p.starts_with(&base)).cloned());
        if let Some(prev) = self.published.get(&config) {
            touched.extend(prev.iter().cloned());
        }
        let mut sorted: Vec<PathBuf> = touched.iter().cloned().collect();
        sorted.sort();
        for file in sorted {
            let uri = self.uri_of(&file);
            let diags = by_file.remove(&file).unwrap_or_default();
            self.publish(&uri, diags)?;
        }
        // Next time it is enough to remember only the files that had diagnostics
        let with_diags: HashSet<PathBuf> = res.diagnostics.iter().filter(|d| !any_syntax || d.syntax).map(|d| normalize(&base.join(&d.file))).collect();
        self.published.insert(config, with_diags);
        Ok(())
    }

    // ---- Go to definition ----

    fn location(&self, path: &Path, line: usize, start: usize, end: usize) -> Value {
        let text = self.text_of(path).unwrap_or_default();
        let line_text = text.lines().nth(line).unwrap_or("");
        json!({
            "uri": self.uri_of(path),
            "range": {
                "start": {"line": line, "character": char_to_utf16(line_text, start)},
                "end": {"line": line, "character": char_to_utf16(line_text, end)},
            }
        })
    }

    fn import_target(&self, from_file: &Path, rel: &str) -> Option<PathBuf> {
        let p = normalize(&from_file.parent()?.join(rel));
        (p.is_file() || self.docs.contains_key(&p)).then_some(p)
    }

    /// Declaration of the type (or enum) `name`: the same file, otherwise the import target
    fn resolve_type(&self, from_file: &Path, text: &str, name: &str) -> Option<(PathBuf, Decl)> {
        if let Some(d) = scan_decls(text).into_iter().find(|d| d.name == name && d.kind != DeclKind::Wrapper) {
            return Some((normalize(from_file), d));
        }
        for imp in scan_imports(text) {
            if imp.names.iter().any(|n| n.name == name) {
                let target = self.import_target(from_file, &imp.path)?;
                let t = self.text_of(&target)?;
                let d = scan_decls(&t).into_iter().find(|d| d.name == name && d.kind != DeclKind::Wrapper)?;
                return Some((target, d));
            }
        }
        None
    }

    fn resolve_wrapper(&self, from_file: &Path, name: &str) -> Option<(PathBuf, Decl)> {
        let init = normalize(&find_init(&normalize(from_file))?);
        let t = self.text_of(&init)?;
        let d = scan_decls(&t).into_iter().find(|d| d.name == name && d.kind == DeclKind::Wrapper)?;
        Some((init, d))
    }

    /// What the thing under the cursor points to: ("type" | "wrapper" | "file", location)
    fn target_at(&self, path: &Path, text: &str, line: usize, col: usize) -> Option<(PathBuf, usize, usize, usize, Option<Decl>, (usize, usize))> {
        let line_text = text.lines().nth(line)?;
        // import statement
        for imp in scan_imports(text).into_iter().filter(|i| i.line == line) {
            if col >= imp.path_start && col <= imp.path_end {
                let t = self.import_target(path, &imp.path)?;
                return Some((t, 0, 0, 0, None, (imp.path_start, imp.path_end)));
            }
            for n in &imp.names {
                if col >= n.start && col <= n.end {
                    let (tp, d) = self.resolve_type(path, text, &n.name)?;
                    // If it would point at a declaration in the same file (itself), look for the import target
                    return Some((tp, d.line, d.start, d.end, Some(d), (n.start, n.end)));
                }
            }
        }
        let (s, e, word) = word_at(line_text, col)?;
        if BUILTIN_TYPES.contains(&word.as_str()) || is_status_code(&word) {
            return None;
        }
        // wrap NAME
        let before: String = line_text.chars().take(s).collect();
        if before.trim() == "wrap" {
            let (ip, d) = self.resolve_wrapper(path, &word)?;
            return Some((ip, d.line, d.start, d.end, Some(d), (s, e)));
        }
        let (tp, d) = self.resolve_type(path, text, &word)?;
        Some((tp, d.line, d.start, d.end, Some(d), (s, e)))
    }

    fn definition(&self, path: &Path, text: &str, line: usize, col: usize) -> Option<Value> {
        let (target, l, s, e, _, _) = self.target_at(path, text, line, col)?;
        Some(self.location(&target, l, s, e))
    }

    // ---- Hover ----

    fn hover(&self, path: &Path, text: &str, line: usize, col: usize) -> Option<Value> {
        let line_text = text.lines().nth(line)?;
        let word = word_at(line_text, col);
        let range = |s: usize, e: usize| {
            json!({"start": {"line": line, "character": char_to_utf16(line_text, s)}, "end": {"line": line, "character": char_to_utf16(line_text, e)}})
        };
        if let Some((tp, _, _, _, Some(d), (s, e))) = self.target_at(path, text, line, col) {
            let src = decl_source(&self.text_of(&tp)?, &d, 40);
            let rel = tp.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
            let kind = match d.kind {
                DeclKind::Type => "型",
                DeclKind::Enum => "enum",
                DeclKind::Wrapper => "ラッパー",
            };
            return Some(json!({
                "contents": {"kind": "markdown", "value": format!("**{}** — {kind}（{rel}）\n\n```comat\n{src}\n```", d.name)},
                "range": range(s, e),
            }));
        }
        let (s, e, w) = word?;
        let doc = if is_status_code(&w) {
            let code: u16 = w[1..].parse().unwrap_or(0);
            match self.status_table(path).get(&code) {
                Some(msg) => {
                    let body = if status::no_body(code) {
                        "本文を持てないステータス。`none`（省略も同じ）".to_string()
                    } else {
                        "本文を省略すると `{ message: string }`。2xx は `data`、それ以外は `error`".to_string()
                    };
                    Some(format!("**{w}** — {code} {msg}\n\n{body}。`{w} none, {{ ... }}` でレスポンスヘッダ"))
                }
                None => Some(format!("**{w}** — 未定義のステータスコード（標準のコードか、`additionalStatusCodes` で足したコードだけ使えます）")),
            }
        } else {
            keyword_doc(&w).map(str::to_string)
        }?;
        Some(json!({"contents": {"kind": "markdown", "value": doc}, "range": range(s, e)}))
    }

    // ---- Symbols ----

    fn document_symbols(&self, path: &Path) -> Value {
        let Some(text) = self.text_of(path) else { return json!([]) };
        let mut out = Vec::new();
        for (i, line) in text.lines().enumerate() {
            let chars: Vec<char> = line.chars().collect();
            if chars.is_empty() || chars[0].is_whitespace() || line.starts_with("//") || line.starts_with('}') {
                continue;
            }
            let Some(first) = line.split(|c: char| !is_ident_char(c)).next().filter(|w| !w.is_empty()) else { continue };
            let end = char_to_utf16(line, chars.len());
            let decls = scan_decls(line);
            let (name, kind, detail) = if let Some(d) = decls.first() {
                let kind = match d.kind {
                    DeclKind::Type => 5,
                    DeclKind::Enum => 10,
                    DeclKind::Wrapper => 12,
                };
                (d.name.clone(), kind, first.to_string())
            } else if is_status_code(first) {
                (line.trim().trim_end_matches('{').trim().to_string(), 14, String::new())
            } else {
                let kind = match first {
                    "import" => 2,
                    "params" | "search" | "body" | "header" | "headerReq" | "headerRes" => 23,
                    "path" | "wrap" | "cookie" | "baseUrl" => 13,
                    _ => continue,
                };
                (line.trim().trim_end_matches('{').trim().to_string(), kind, String::new())
            };
            let range = json!({"start": {"line": i, "character": 0}, "end": {"line": i, "character": end}});
            out.push(json!({"name": name, "detail": detail, "kind": kind, "range": range, "selectionRange": range}));
        }
        Value::Array(out)
    }

    // ---- Completion ----

    fn completion(&self, path: &Path, text: &str, line: usize, col: usize) -> Value {
        let line_text = text.lines().nth(line).unwrap_or("");
        let prefix: String = line_text.chars().take(col).collect();
        let item = |label: &str, kind: u32, detail: &str| json!({"label": label, "kind": kind, "detail": detail});
        let mut items = Vec::new();

        // wrap NAME
        let t = prefix.trim_start();
        if t.starts_with("wrap ") && !t["wrap ".len()..].contains(' ') {
            if let Some(init) = find_init(&normalize(path)) {
                if let Some(it) = self.text_of(&init) {
                    for d in scan_decls(&it).iter().filter(|d| d.kind == DeclKind::Wrapper) {
                        items.push(item(&d.name, 3, "ラッパー（init.comat）"));
                    }
                }
            }
            return Value::Array(items);
        }
        // cookie on|off
        if t.starts_with("cookie ") && !t["cookie ".len()..].contains(' ') {
            return json!([item("on", 12, "cookie を送受信する"), item("off", 12, "cookie を使わない")]);
        }

        let statement_start = t.chars().all(is_ident_char);
        let type_position = {
            let trimmed = prefix.trim_end_matches(|c: char| is_ident_char(c));
            let tt = trimmed.trim_end();
            tt.ends_with(':') || tt.ends_with('|') || tt.ends_with("...") || tt.ends_with('[') || {
                let first = t.split_whitespace().next().unwrap_or("");
                (first == "body" || is_status_code(first)) && t.split_whitespace().count() <= 2 && trimmed.ends_with(' ')
            }
        };
        if type_position {
            for b in BUILTIN_TYPES {
                items.push(item(b, 7, "組み込みの型"));
            }
            for c in ["null", "none", "empty"] {
                items.push(item(c, 21, ""));
            }
            for d in scan_decls(text).iter().filter(|d| d.kind != DeclKind::Wrapper) {
                items.push(item(&d.name, 7, "このファイルの型"));
            }
            for imp in scan_imports(text) {
                for n in imp.names {
                    items.push(item(&n.name, 7, &format!("import（{}）", imp.path)));
                }
            }
        } else if statement_start {
            for k in ["import", "enum", "path", "params", "search", "body", "header", "headerReq", "headerRes", "wrap", "cookie", "cache", "baseUrl", "wrapper", "ctx"] {
                items.push(item(k, 14, keyword_doc(k).unwrap_or("").split(" — ").nth(1).unwrap_or("")));
            }
            for (code, msg) in &self.status_table(path) {
                let note = if status::no_body(*code) { "（本文なし）" } else { "" };
                items.push(item(&format!("s{code}"), 21, &format!("{code} {msg}{note}")));
            }
        }
        Value::Array(items)
    }
}

fn capabilities() -> Value {
    json!({
        "capabilities": {
            "textDocumentSync": {"openClose": true, "change": 1, "save": {"includeText": false}},
            "definitionProvider": true,
            "hoverProvider": true,
            "documentSymbolProvider": true,
            "completionProvider": {"triggerCharacters": [":", " ", ".", "|"]},
        },
        "serverInfo": {"name": "comatype-lsp", "version": env!("CARGO_PKG_VERSION")},
    })
}

//! Parser for `.comat` (hand-written recursive descent).
//!
//! Statements are separated by keywords, not lines. Only the values of `path` / `baseUrl` / `import ... from` are read raw to the end of the line.

use crate::ast::*;
use crate::diag::{Diagnostic, Span};

pub fn parse(file: &str, src: &str) -> Result<ComatypeFile, Diagnostic> {
    let mut p = Parser { src: src.chars().collect(), pos: 0, line: 1, col: 1, file: file.to_string() };
    p.file()
}

struct Parser {
    src: Vec<char>,
    pos: usize,
    line: usize,
    col: usize,
    file: String,
}

type PResult<T> = Result<T, Diagnostic>;

impl Parser {
    fn span(&self) -> Span {
        Span { line: self.line, col: self.col }
    }

    fn err<T>(&self, msg: impl Into<String>) -> PResult<T> {
        Err(Diagnostic::syntax_error(&self.file, self.span(), msg))
    }

    fn err_at<T>(&self, span: Span, msg: impl Into<String>) -> PResult<T> {
        Err(Diagnostic::syntax_error(&self.file, span, msg))
    }

    fn peek(&self) -> Option<char> {
        self.src.get(self.pos).copied()
    }

    fn peek_at(&self, n: usize) -> Option<char> {
        self.src.get(self.pos + n).copied()
    }

    fn bump(&mut self) -> Option<char> {
        let c = self.peek()?;
        self.pos += 1;
        if c == '\n' {
            self.line += 1;
            self.col = 1;
        } else {
            self.col += 1;
        }
        Some(c)
    }

    fn at_comment(&self) -> bool {
        self.peek() == Some('/') && self.peek_at(1) == Some('/')
    }

    fn skip_comment(&mut self) {
        while let Some(c) = self.peek() {
            if c == '\n' {
                break;
            }
            self.bump();
        }
    }

    /// Skips whitespace, newlines and comments
    fn ws(&mut self) {
        loop {
            match self.peek() {
                Some(c) if c.is_whitespace() => {
                    self.bump();
                }
                Some('/') if self.at_comment() => self.skip_comment(),
                _ => break,
            }
        }
    }

    /// Skips whitespace and comments that do not cross a newline
    fn ws_inline(&mut self) {
        loop {
            match self.peek() {
                Some(c) if c != '\n' && c.is_whitespace() => {
                    self.bump();
                }
                Some('/') if self.at_comment() => self.skip_comment(),
                _ => break,
            }
        }
    }

    fn eat(&mut self, c: char) -> bool {
        if self.peek() == Some(c) {
            self.bump();
            true
        } else {
            false
        }
    }

    fn expect(&mut self, c: char) -> PResult<()> {
        self.ws();
        if self.eat(c) {
            Ok(())
        } else {
            let found = self.peek().map(|c| format!("`{c}`")).unwrap_or_else(|| "ファイルの終わり".into());
            self.err(format!("`{c}` が必要です（{found} がありました）"))
        }
    }

    fn is_ident_start(c: char) -> bool {
        c.is_ascii_alphabetic() || c == '_'
    }

    fn is_ident_char(c: char) -> bool {
        c.is_ascii_alphanumeric() || c == '_'
    }

    fn ident(&mut self) -> PResult<(String, Span)> {
        self.ws();
        let span = self.span();
        match self.peek() {
            Some(c) if Self::is_ident_start(c) => {}
            Some(c) => return self.err(format!("名前が必要です（`{c}` がありました）")),
            None => return self.err("名前が必要です（ファイルの終わり）"),
        }
        let mut s = String::new();
        while let Some(c) = self.peek() {
            if Self::is_ident_char(c) {
                s.push(c);
                self.bump();
            } else {
                break;
            }
        }
        Ok((s, span))
    }

    fn string_lit(&mut self) -> PResult<String> {
        let span = self.span();
        let quote = self.bump().unwrap();
        let mut s = String::new();
        loop {
            match self.bump() {
                None | Some('\n') => return self.err_at(span, "文字列が閉じられていません"),
                Some(c) if c == quote => return Ok(s),
                Some('\\') => match self.bump() {
                    Some('n') => s.push('\n'),
                    Some('t') => s.push('\t'),
                    Some(c) => s.push(c),
                    None => return self.err_at(span, "文字列が閉じられていません"),
                },
                Some(c) => s.push(c),
            }
        }
    }

    /// Reads raw to the end of the line. Drops everything after ` //` as a comment and strips surrounding quotes
    fn raw_line(&mut self) -> PResult<String> {
        self.ws_inline();
        let mut s = String::new();
        let mut prev_ws = true;
        while let Some(c) = self.peek() {
            if c == '\n' {
                break;
            }
            if c == '/' && self.at_comment() && prev_ws {
                self.skip_comment();
                break;
            }
            prev_ws = c.is_whitespace();
            s.push(c);
            self.bump();
        }
        let s = s.trim().to_string();
        let b: Vec<char> = s.chars().collect();
        let s = if b.len() >= 2 && (b[0] == '"' || b[0] == '\'') && b[b.len() - 1] == b[0] {
            b[1..b.len() - 1].iter().collect()
        } else {
            s
        };
        Ok(s)
    }

    // ---- Statements ----

    fn file(&mut self) -> PResult<ComatypeFile> {
        let mut stmts = Vec::new();
        loop {
            self.ws();
            if self.peek().is_none() {
                break;
            }
            stmts.push(self.stmt()?);
        }
        Ok(ComatypeFile { stmts })
    }

    fn stmt(&mut self) -> PResult<Stmt> {
        let (word, span) = self.ident()?;
        let kind = match word.as_str() {
            "import" => self.import()?,
            "enum" => {
                let (name, _) = self.ident()?;
                let variants = self.enum_body()?;
                StmtKind::Enum { name, variants }
            }
            "path" => {
                let value = self.raw_line()?;
                if value.is_empty() {
                    return self.err_at(span, "path の値がありません");
                }
                StmtKind::Path { value }
            }
            "params" => StmtKind::Params { members: self.members()? },
            "search" => StmtKind::Search { members: self.members()? },
            "header" => StmtKind::Header { members: self.members()? },
            "headerReq" => StmtKind::HeaderReq { members: self.members()? },
            "headerRes" => StmtKind::HeaderRes { members: self.members()? },
            "body" => StmtKind::Body { ty: self.type_expr()? },
            "wrap" => {
                let (name, _) = self.ident()?;
                self.ws_inline();
                let off = self.keyword_inline("off");
                StmtKind::Wrap { name, off }
            }
            "cookie" => self.cookie()?,
            "cache" => self.cache(span)?,
            "baseUrl" => {
                let value = self.raw_line()?;
                if value.is_empty() {
                    return self.err_at(span, "baseUrl の値がありません");
                }
                StmtKind::BaseUrl { value }
            }
            "wrapper" => self.wrapper()?,
            w if status_code(w).is_some() => {
                let code = status_code(w).unwrap();
                let ty = self.status_body()?;
                self.ws();
                let headers = if self.eat(',') { Some(self.members()?) } else { None };
                StmtKind::Status { code, ty, headers }
            }
            _ => {
                self.ws();
                if self.peek() == Some('{') {
                    StmtKind::TypeDecl { name: word, members: self.members()? }
                } else {
                    return self.err_at(span, format!("`{word}` は文として解釈できません（型の宣言は `名前 {{ ... }}`）"));
                }
            }
        };
        Ok(Stmt { span, kind })
    }

    /// Body type after `sNNN`. Omitted (default body) if nothing follows on the same line (or a `,` comes)
    fn status_body(&mut self) -> PResult<Option<TypeExpr>> {
        self.ws_inline();
        if matches!(self.peek(), None | Some('\n') | Some(',') | Some('}')) {
            return Ok(None);
        }
        self.type_expr().map(Some)
    }

    /// Reads the next word on the same line if it is `word`
    fn keyword_inline(&mut self, word: &str) -> bool {
        let save = (self.pos, self.line, self.col);
        if let Ok((w, _)) = self.ident_inline() {
            if w == word {
                return true;
            }
        }
        self.pos = save.0;
        self.line = save.1;
        self.col = save.2;
        false
    }

    fn ident_inline(&mut self) -> PResult<(String, Span)> {
        self.ws_inline();
        if self.peek() == Some('\n') {
            return self.err("同じ行に名前がありません");
        }
        self.ident()
    }

    fn import(&mut self) -> PResult<StmtKind> {
        let mut names = vec![self.ident()?.0];
        loop {
            self.ws();
            if self.eat(',') {
                names.push(self.ident()?.0);
            } else {
                break;
            }
        }
        let (from, span) = self.ident()?;
        if from != "from" {
            return self.err_at(span, "`import 名前 from パス` の形で書いてください");
        }
        let path = self.raw_line()?;
        if path.is_empty() {
            return self.err_at(span, "import のパスがありません");
        }
        Ok(StmtKind::Import { names, from: path })
    }

    /// `cache off` / `cache <ttl ms>` / `cache <ttl ms> cookie`
    fn cache(&mut self, span: Span) -> PResult<StmtKind> {
        use crate::ast::CacheMode;
        self.ws_inline();
        if self.keyword_inline("off") {
            return Ok(StmtKind::Cache { mode: CacheMode::Off });
        }
        let mut digits = String::new();
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() {
                digits.push(c);
                self.bump();
            } else {
                break;
            }
        }
        let usage = "`cache off` / `cache <ttl ミリ秒>` / `cache <ttl ミリ秒> cookie` のどれかで書いてください";
        let Ok(ttl_ms) = digits.parse::<u64>() else { return self.err_at(span, usage) };
        if ttl_ms == 0 {
            return self.err_at(span, "cache の ttl は 1 以上のミリ秒にしてください（キャッシュしないなら `cache off`）");
        }
        let cookie = self.keyword_inline("cookie");
        self.ws_inline();
        if !matches!(self.peek(), None | Some('\n') | Some('\r')) && !(self.peek() == Some('/') && self.peek_at(1) == Some('/')) {
            return self.err_at(span, usage);
        }
        Ok(StmtKind::Cache { mode: if cookie { CacheMode::Cookie { ttl_ms } } else { CacheMode::Memory { ttl_ms } } })
    }

    fn cookie(&mut self) -> PResult<StmtKind> {
        let (name, span) = self.ident()?;
        match name.as_str() {
            "on" => return Ok(StmtKind::Cookie { enabled: true }),
            "off" => return Ok(StmtKind::Cookie { enabled: false }),
            _ => {}
        }
        self.ws();
        if self.peek() != Some('{') {
            return self.err_at(span, "`cookie on` / `cookie off` / `cookie 名前 { ... }` のどれかで書いてください");
        }
        self.bump();
        let mut settings = Vec::new();
        loop {
            self.ws();
            if self.eat('}') {
                break;
            }
            let (key, _) = self.ident()?;
            self.expect(':')?;
            self.ws();
            let value = match self.peek() {
                Some('"') | Some('\'') => self.string_lit()?,
                _ => {
                    let mut v = String::new();
                    while let Some(c) = self.peek() {
                        if !c.is_whitespace() && c != ',' && c != '}' && c != '{' {
                            v.push(c);
                            self.bump();
                        } else {
                            break;
                        }
                    }
                    if v.is_empty() {
                        return self.err("値が必要です");
                    }
                    v
                }
            };
            settings.push(Setting { key, value });
            self.ws();
            self.eat(',');
        }
        Ok(StmtKind::CookieDef { name, settings })
    }

    fn wrapper(&mut self) -> PResult<StmtKind> {
        let (name, _) = self.ident()?;
        self.expect('{')?;
        let mut ctx = None;
        let mut statuses = Vec::new();
        loop {
            self.ws();
            if self.eat('}') {
                break;
            }
            let (word, span) = self.ident()?;
            if word == "ctx" {
                if ctx.is_some() {
                    return self.err_at(span, "ctx が 2 回書かれています");
                }
                ctx = Some(self.members()?);
            } else if let Some(code) = status_code(&word) {
                let ty = self.status_body()?;
                statuses.push(WrapperStatus { code, ty, span });
            } else {
                return self.err_at(span, format!("wrapper の中では `ctx` と `sNNN` だけ書けます（`{word}`）"));
            }
        }
        Ok(StmtKind::Wrapper { name, ctx, statuses })
    }

    fn enum_body(&mut self) -> PResult<Vec<String>> {
        self.expect('{')?;
        let mut v = Vec::new();
        loop {
            self.ws();
            if self.eat('}') {
                break;
            }
            v.push(self.ident()?.0);
            self.ws();
            self.eat(',');
        }
        Ok(v)
    }

    // ---- Types ----

    fn members(&mut self) -> PResult<Vec<Member>> {
        self.expect('{')?;
        let mut v = Vec::new();
        loop {
            self.ws();
            if self.eat('}') {
                break;
            }
            let span = self.span();
            if self.peek() == Some('.') {
                if self.peek_at(1) == Some('.') && self.peek_at(2) == Some('.') {
                    self.bump();
                    self.bump();
                    self.bump();
                    let (name, _) = self.ident()?;
                    v.push(Member::Spread { name, span });
                } else {
                    return self.err("`...型名` の形で書いてください");
                }
            } else {
                let name = match self.peek() {
                    Some('"') | Some('\'') => self.string_lit()?,
                    _ => self.ident()?.0,
                };
                let optional = self.eat('?');
                self.expect(':')?;
                let ty = self.type_expr()?;
                v.push(Member::Field { name, optional, ty, span });
            }
            self.ws();
            self.eat(',');
        }
        Ok(v)
    }

    fn type_expr(&mut self) -> PResult<TypeExpr> {
        let first = self.type_postfix()?;
        let mut variants = vec![first];
        loop {
            self.ws();
            if self.peek() == Some('|') {
                self.bump();
                variants.push(self.type_postfix()?);
            } else {
                break;
            }
        }
        Ok(if variants.len() == 1 { variants.pop().unwrap() } else { TypeExpr::Union { variants } })
    }

    fn type_postfix(&mut self) -> PResult<TypeExpr> {
        let mut t = self.type_primary()?;
        loop {
            self.ws();
            if self.peek() == Some('[') && self.peek_at(1) == Some(']') {
                self.bump();
                self.bump();
                t = TypeExpr::Array { item: Box::new(t) };
            } else {
                break;
            }
        }
        Ok(t)
    }

    fn type_primary(&mut self) -> PResult<TypeExpr> {
        self.ws();
        match self.peek() {
            Some('{') => Ok(TypeExpr::Object { members: self.members()? }),
            Some('"') | Some('\'') => Ok(TypeExpr::Literal { value: self.string_lit()? }),
            Some(c) if Self::is_ident_start(c) => {
                let (name, span) = self.ident()?;
                match name.as_str() {
                    "null" => Ok(TypeExpr::Null),
                    "none" => Ok(TypeExpr::None { span }),
                    "empty" => Ok(TypeExpr::Empty { span }),
                    n if SCALARS.contains(&n) => {
                        let constraint = if self.peek() == Some('(') { Some(self.constraint()?) } else { None };
                        Ok(TypeExpr::Scalar { name, constraint })
                    }
                    _ => {
                        if self.peek() == Some('(') {
                            return self.err_at(span, format!("制約 `(...)` を付けられるのは組み込みの型だけです（`{name}`）"));
                        }
                        Ok(TypeExpr::Ref { name, span })
                    }
                }
            }
            Some(c) => self.err(format!("型が必要です（`{c}` がありました）")),
            None => self.err("型が必要です（ファイルの終わり）"),
        }
    }

    fn constraint(&mut self) -> PResult<Constraint> {
        let open = self.span();
        self.bump(); // (
        self.ws();
        let c = if self.peek().map_or(false, Self::is_ident_start) {
            let (key, span) = self.ident()?;
            if key != "pattern" {
                return self.err_at(span, format!("未知の制約 `{key}`（使えるのは `pattern`、または `最小..最大`）"));
            }
            self.expect(':')?;
            self.ws();
            if !matches!(self.peek(), Some('"') | Some('\'')) {
                return self.err("pattern の値は文字列で書いてください");
            }
            Constraint::Pattern { value: self.string_lit()? }
        } else {
            let min = self.opt_int()?;
            self.ws();
            if !(self.peek() == Some('.') && self.peek_at(1) == Some('.')) {
                return self.err("範囲は `最小..最大` の形で書いてください");
            }
            self.bump();
            self.bump();
            self.ws();
            let max = self.opt_int()?;
            if min.is_none() && max.is_none() {
                return self.err_at(open, "範囲の最小か最大のどちらかは必要です");
            }
            if let (Some(a), Some(b)) = (min, max) {
                if a > b {
                    return self.err_at(open, format!("範囲の最小 {a} が最大 {b} より大きいです"));
                }
            }
            Constraint::Range { min, max }
        };
        self.expect(')')?;
        Ok(c)
    }

    fn opt_int(&mut self) -> PResult<Option<i64>> {
        let mut s = String::new();
        if self.peek() == Some('-') {
            s.push('-');
            self.bump();
        }
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() {
                s.push(c);
                self.bump();
            } else {
                break;
            }
        }
        if s.is_empty() {
            return Ok(None);
        }
        match s.parse() {
            Ok(n) => Ok(Some(n)),
            Err(_) => self.err(format!("整数として読めません: {s}")),
        }
    }
}

/// `s` + 3 digits, like `s200`
fn status_code(word: &str) -> Option<u16> {
    let rest = word.strip_prefix('s')?;
    if rest.len() == 3 && rest.chars().all(|c| c.is_ascii_digit()) {
        rest.parse().ok()
    } else {
        None
    }
}

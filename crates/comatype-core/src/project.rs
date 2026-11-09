//! Project loading, name resolution, merging of defaults, and checking. The result is the IR.

use crate::ast::*;
use crate::config::{self, Config};
use crate::diag::{Diagnostic, Span};
use crate::ir;
use crate::parser;
use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::rc::Rc;

const METHODS: &[&str] = &["get", "post", "put", "patch", "delete", "options", "query", "head"];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Role {
    Init,
    Defaults,
    Endpoint,
    TypeLib,
}

struct SrcFile {
    path: PathBuf,
    display: String,
    /// Relative to the config directory (no extension, `/` separated). Base of the type ID
    module: String,
    ast: ComatypeFile,
    /// Type name → index into stmts
    decls: HashMap<String, usize>,
    /// Name → (file it is imported from, span of the import statement)
    imports: HashMap<String, (PathBuf, Span)>,
    used: RefCell<HashSet<String>>,
}

struct Workspace {
    base: PathBuf,
    files: BTreeMap<PathBuf, Option<Rc<SrcFile>>>,
    diags: Vec<Diagnostic>,
    /// Content open in the editor and not yet saved (normalized path → text). Takes precedence over disk
    overlay: Rc<HashMap<PathBuf, String>>,
    /// Usable status codes (standard + additionalStatusCodes)
    statuses: Rc<crate::status::StatusTable>,
}

pub struct CheckResult {
    pub ir: Option<ir::Ir>,
    pub diagnostics: Vec<Diagnostic>,
}

/// Reads the config, checks every service, and builds the IR
pub fn check_config(config_path: &Path, only: Option<&str>) -> CheckResult {
    check_config_with_overlay(config_path, only, &HashMap::new())
}

/// Same as `check_config`, but reads the `overlay` files (unsaved content being edited in the editor) in preference to disk.
/// Keys are absolute file paths (canonicalized when possible, as in `normalize`)
pub fn check_config_with_overlay(config_path: &Path, only: Option<&str>, overlay: &HashMap<PathBuf, String>) -> CheckResult {
    let (cfg, base) = match config::load(config_path) {
        Ok(v) => v,
        Err(d) => return CheckResult { ir: None, diagnostics: d },
    };
    check_with_overlay(&cfg, &base, only, overlay)
}

pub fn check(cfg: &Config, base: &Path, only: Option<&str>) -> CheckResult {
    check_with_overlay(cfg, base, only, &HashMap::new())
}

pub fn check_with_overlay(cfg: &Config, base: &Path, only: Option<&str>, overlay: &HashMap<PathBuf, String>) -> CheckResult {
    let overlay: Rc<HashMap<PathBuf, String>> = Rc::new(overlay.iter().map(|(k, v)| (normalize(k), v.clone())).collect());
    let statuses = Rc::new(cfg.status_table());
    let mut diags = Vec::new();
    let mut services = BTreeMap::new();
    if let Some(name) = only {
        if !cfg.services.contains_key(name) {
            diags.push(Diagnostic::error("comatype.config.json", Span::default(), format!("service `{name}` does not exist")));
        }
    }
    let base = base.canonicalize().unwrap_or_else(|_| base.to_path_buf());
    for (name, s) in &cfg.services {
        if only.is_some_and(|o| o != name) {
            continue;
        }
        let dir = base.join(&s.comat_dir);
        let (svc, d) = build_service(&base, &dir, overlay.clone(), statuses.clone());
        diags.extend(d);
        if let Some(svc) = svc {
            services.insert(name.clone(), svc);
        }
    }
    diags.sort_by(|a, b| (&a.file, a.line, a.col).cmp(&(&b.file, b.line, b.col)));
    let has_error = diags.iter().any(|d| d.is_error());
    CheckResult { ir: if has_error { None } else { Some(ir::Ir { version: ir::IR_VERSION, services }) }, diagnostics: diags }
}

/// Parses a single file only (for looking at the AST)
pub fn parse_only(path: &Path) -> Result<ComatypeFile, Diagnostic> {
    let name = path.display().to_string();
    let text = std::fs::read_to_string(path).map_err(|e| Diagnostic::error(&name, Span::default(), format!("cannot read: {e}")))?;
    parser::parse(&name, &text)
}

// ---- Loading ----

fn normalize(p: &Path) -> PathBuf {
    p.canonicalize().unwrap_or_else(|_| p.to_path_buf())
}

impl Workspace {
    fn display(&self, p: &Path) -> String {
        p.strip_prefix(&self.base).unwrap_or(p).to_string_lossy().replace('\\', "/")
    }

    fn load(&mut self, path: &Path) -> Option<Rc<SrcFile>> {
        let path = normalize(path);
        if let Some(f) = self.files.get(&path) {
            return f.clone();
        }
        // Mark it first so that circular imports do not recurse forever
        self.files.insert(path.clone(), None);
        let display = self.display(&path);
        let read = match self.overlay.get(&path) {
            Some(t) => Ok(t.clone()),
            None => std::fs::read_to_string(&path),
        };
        let text = match read {
            Ok(t) => t,
            Err(e) => {
                self.diags.push(Diagnostic::error(&display, Span::default(), format!("cannot read: {e}")));
                return None;
            }
        };
        let ast = match parser::parse(&display, &text) {
            Ok(a) => a,
            Err(d) => {
                self.diags.push(d);
                return None;
            }
        };
        let module = display.strip_suffix(".comat").unwrap_or(&display).to_string();
        let mut decls = HashMap::new();
        let mut imports: HashMap<String, (PathBuf, Span)> = HashMap::new();
        let dir = path.parent().unwrap_or(Path::new(".")).to_path_buf();
        let mut targets = Vec::new();
        for (i, st) in ast.stmts.iter().enumerate() {
            match &st.kind {
                StmtKind::TypeDecl { name, .. } | StmtKind::Enum { name, .. } => {
                    if SCALARS.contains(&name.as_str()) || matches!(name.as_str(), "null" | "none" | "empty") {
                        self.diags.push(Diagnostic::error(
                            &display,
                            st.span,
                            format!("`{name}` is a built-in name and cannot be used as a type name"),
                        ));
                    } else if decls.insert(name.clone(), i).is_some() {
                        self.diags.push(Diagnostic::error(&display, st.span, format!("type `{name}` is duplicated")));
                    }
                }
                StmtKind::Import { names, from } => {
                    let target = normalize(&dir.join(from));
                    if !target.is_file() {
                        self.diags.push(Diagnostic::error(&display, st.span, format!("import target not found: {from}")));
                        continue;
                    }
                    for n in names {
                        if imports.insert(n.clone(), (target.clone(), st.span)).is_some() {
                            self.diags.push(Diagnostic::error(&display, st.span, format!("`{n}` is imported more than once")));
                        }
                    }
                    targets.push(target);
                }
                _ => {}
            }
        }
        for n in imports.keys() {
            if decls.contains_key(n) {
                let sp = imports[n].1;
                self.diags.push(Diagnostic::error(&display, sp, format!("imported `{n}` clashes with a type in this file")));
            }
        }
        let src = Rc::new(SrcFile { path: path.clone(), display, module, ast, decls, imports, used: RefCell::new(HashSet::new()) });
        self.files.insert(path, Some(src.clone()));
        for t in targets {
            self.load(&t);
        }
        // Whether the imported name is declared in the other file
        for (n, (target, sp)) in &src.imports {
            if let Some(Some(tf)) = self.files.get(target) {
                if !tf.decls.contains_key(n) {
                    self.diags.push(Diagnostic::error(&src.display, *sp, format!("type `{n}` does not exist in {}", tf.display)));
                }
            }
        }
        Some(src)
    }

    /// Declaration source of type `name` visible from `file`: (file, index into stmts)
    fn lookup(&self, file: &SrcFile, name: &str) -> Option<(Rc<SrcFile>, usize)> {
        if let Some(&i) = file.decls.get(name) {
            let me = self.files.get(&file.path)?.clone()?;
            return Some((me, i));
        }
        let (target, _) = file.imports.get(name)?;
        file.used.borrow_mut().insert(name.to_string());
        let tf = self.files.get(target)?.clone()?;
        let i = *tf.decls.get(name)?;
        Some((tf, i))
    }
}

fn type_id(f: &SrcFile, name: &str) -> String {
    format!("{}::{}", f.module, name)
}

// ---- Type resolution ----

#[derive(Clone, Copy, PartialEq)]
enum Pos {
    Field,
    StatusBody,
    Other,
}

struct Resolver<'a> {
    ws: &'a Workspace,
    diags: Vec<Diagnostic>,
}

impl<'a> Resolver<'a> {
    fn error(&mut self, f: &SrcFile, span: Span, msg: impl Into<String>) {
        self.diags.push(Diagnostic::error(&f.display, span, msg));
    }

    fn warn(&mut self, f: &SrcFile, span: Span, msg: impl Into<String>) {
        self.diags.push(Diagnostic::warning(&f.display, span, msg));
    }

    /// Body of `sNNN`. An unregistered code is an error. Omitting the type gives the default (`{ message: string }`; none for codes without a body)
    fn status_body(&mut self, f: &SrcFile, span: Span, code: u16, ty: &Option<TypeExpr>) -> Result<Option<ir::Type>, ()> {
        if !self.ws.statuses.contains_key(&code) {
            self.error(f, span, format!("status code {code} is not defined (only standard codes and codes added with additionalStatusCodes in comatype.config.json can be used)"));
            return Err(());
        }
        let no_body = crate::status::no_body(code);
        match ty {
            None if no_body => Ok(None),
            None => Ok(Some(ir::Type::Object {
                fields: vec![ir::Field {
                    name: "message".into(),
                    optional: false,
                    ty: ir::Type::Scalar { name: "string".into(), constraint: None },
                }],
            })),
            Some(t) => {
                if no_body && !matches!(t, TypeExpr::None { .. }) {
                    self.error(f, span, format!("status {code} cannot have a body (write `s{code} none` or omit the type)"));
                    return Err(());
                }
                Ok(self.ty(f, t, Pos::StatusBody))
            }
        }
    }

    fn ty(&mut self, f: &SrcFile, e: &TypeExpr, pos: Pos) -> Option<ir::Type> {
        match e {
            TypeExpr::Scalar { name, constraint } => {
                if let Some(c) = constraint {
                    let ok = match c {
                        Constraint::Range { .. } => matches!(name.as_str(), "string" | "int" | "int64" | "decimal"),
                        Constraint::Pattern { .. } => name == "string",
                    };
                    if !ok {
                        self.error(f, Span::default(), format!("this constraint cannot be applied to `{name}`"));
                    }
                }
                Some(ir::Type::Scalar { name: name.clone(), constraint: constraint.clone() })
            }
            TypeExpr::Ref { name, span } => match self.ws.lookup(f, name) {
                Some((df, _)) => Some(ir::Type::Ref { id: type_id(&df, name), name: name.clone() }),
                None => {
                    self.error(f, *span, format!("type `{name}` not found (declare it or import it)"));
                    None
                }
            },
            TypeExpr::Object { members } => {
                let fields = self.fields(f, members, &mut Vec::new())?;
                Some(ir::Type::Object { fields })
            }
            TypeExpr::Array { item } => Some(ir::Type::Array { item: Box::new(self.ty(f, item, Pos::Other)?) }),
            TypeExpr::Union { variants } => {
                let mut out = Vec::new();
                let mut ok = true;
                for v in variants {
                    match self.ty(f, v, Pos::Other) {
                        Some(t) => out.push(t),
                        None => ok = false,
                    }
                }
                if ok {
                    Some(ir::Type::Union { variants: out })
                } else {
                    None
                }
            }
            TypeExpr::Literal { value } => Some(ir::Type::Literal { value: value.clone() }),
            TypeExpr::Null => Some(ir::Type::Null),
            TypeExpr::None { span } => {
                if pos != Pos::StatusBody {
                    self.error(f, *span, "`none` can only be used as a response body (`s200 none`)");
                }
                None
            }
            TypeExpr::Empty { span } => {
                if pos != Pos::Field {
                    self.error(f, *span, "`empty` can only be used as a field type (`uid: empty`)");
                }
                None
            }
        }
    }

    /// Expands members into a list of fields. Later ones win, and `empty` removes the field
    fn fields(&mut self, f: &SrcFile, members: &[Member], stack: &mut Vec<String>) -> Option<Vec<ir::Field>> {
        let mut out: Vec<ir::Field> = Vec::new();
        let mut explicit: HashSet<&str> = HashSet::new();
        let mut ok = true;
        for m in members {
            match m {
                Member::Field { name, optional, ty, span } => {
                    if !explicit.insert(name) {
                        self.error(f, *span, format!("field `{name}` is duplicated"));
                        ok = false;
                        continue;
                    }
                    if let TypeExpr::Empty { .. } = ty {
                        out.retain(|x| &x.name != name);
                        continue;
                    }
                    match self.ty(f, ty, Pos::Field) {
                        Some(t) => put(&mut out, ir::Field { name: name.clone(), optional: *optional, ty: t }),
                        None => ok = false,
                    }
                }
                Member::Spread { name, span } => {
                    let Some((df, idx)) = self.ws.lookup(f, name) else {
                        self.error(f, *span, format!("type `{name}` not found"));
                        ok = false;
                        continue;
                    };
                    let StmtKind::TypeDecl { members: inner, .. } = &df.ast.stmts[idx].kind else {
                        self.error(f, *span, format!("`...{name}` is an enum and cannot be spread"));
                        ok = false;
                        continue;
                    };
                    let id = type_id(&df, name);
                    if stack.contains(&id) {
                        self.error(f, *span, format!("`...{name}` is circular"));
                        ok = false;
                        continue;
                    }
                    stack.push(id);
                    let sub = self.fields(&df, inner, stack);
                    stack.pop();
                    match sub {
                        Some(fs) => fs.into_iter().for_each(|x| put(&mut out, x)),
                        None => ok = false,
                    }
                }
            }
        }
        if ok {
            Some(out)
        } else {
            None
        }
    }
}

fn put(out: &mut Vec<ir::Field>, f: ir::Field) {
    if let Some(slot) = out.iter_mut().find(|x| x.name == f.name) {
        *slot = f;
    } else {
        out.push(f);
    }
}

// ---- Per-file resolution results ----

#[derive(Default)]
struct Resolved {
    path: Option<(String, Span)>,
    params: Vec<ir::Field>,
    search: Vec<ir::Field>,
    header: Vec<ir::Field>,
    header_req: Vec<ir::Field>,
    header_res: Vec<ir::Field>,
    body: Option<ir::Type>,
    statuses: Vec<(u16, Option<ir::Type>, Vec<ir::Field>)>,
    wraps: Vec<(String, bool)>,
    cookie: Option<bool>,
    cache: Option<crate::ast::CacheMode>,
    base_url: Option<String>,
    cookie_def: Option<ir::CookieDef>,
    wrappers: Vec<ir::Wrapper>,
}

fn resolve_file(ws: &Workspace, f: &SrcFile, role: Role, diags: &mut Vec<Diagnostic>) -> Resolved {
    let mut r = Resolver { ws, diags: Vec::new() };
    let mut out = Resolved::default();
    let mut seen: HashMap<&'static str, Span> = HashMap::new();
    let mut codes: HashSet<u16> = HashSet::new();
    let mut wrapper_names: HashSet<&str> = HashSet::new();

    for st in &f.ast.stmts {
        let kind = &st.kind;
        let allowed = match kind {
            StmtKind::Import { .. } | StmtKind::Enum { .. } | StmtKind::TypeDecl { .. } => true,
            StmtKind::Path { .. } | StmtKind::Params { .. } | StmtKind::Search { .. } | StmtKind::Body { .. } => role == Role::Endpoint,
            StmtKind::Cache { .. } => role == Role::Endpoint,
            StmtKind::Header { .. }
            | StmtKind::HeaderReq { .. }
            | StmtKind::HeaderRes { .. }
            | StmtKind::Status { .. }
            | StmtKind::Wrap { .. }
            | StmtKind::Cookie { .. } => {
                matches!(role, Role::Endpoint | Role::Defaults)
            }
            StmtKind::BaseUrl { .. } | StmtKind::CookieDef { .. } | StmtKind::Wrapper { .. } => role == Role::Init,
        };
        // cache is set per endpoint. It has no effect in defaults.comat / init.comat, so warn and ignore it
        if matches!(kind, StmtKind::Cache { .. }) && matches!(role, Role::Defaults | Role::Init) {
            let place = if role == Role::Init { "init.comat" } else { "defaults.comat" };
            r.warn(f, st.span, format!("`cache` has no effect in {place} (write it in an endpoint .comat file); ignored"));
            continue;
        }
        if !allowed {
            let place = match role {
                Role::Init => "init.comat",
                Role::Defaults => "defaults.comat",
                Role::Endpoint => "an endpoint .comat file",
                Role::TypeLib => "a types-only file",
            };
            r.error(f, st.span, format!("`{}` cannot be written in {}", kind.keyword(), place));
            continue;
        }
        // Things that may be written only once per file
        let once = match kind {
            StmtKind::Path { .. } => Some("path"),
            StmtKind::Params { .. } => Some("params"),
            StmtKind::Search { .. } => Some("search"),
            StmtKind::Body { .. } => Some("body"),
            StmtKind::Header { .. } => Some("header"),
            StmtKind::HeaderReq { .. } => Some("headerReq"),
            StmtKind::HeaderRes { .. } => Some("headerRes"),
            StmtKind::Cookie { .. } => Some("cookie"),
            StmtKind::Cache { .. } => Some("cache"),
            StmtKind::BaseUrl { .. } => Some("baseUrl"),
            StmtKind::CookieDef { .. } => Some("cookie <name>"),
            _ => None,
        };
        if let Some(k) = once {
            if let Some(prev) = seen.insert(k, st.span) {
                r.error(f, st.span, format!("`{k}` is allowed only once per file (also on line {})", prev.line));
                continue;
            }
        }
        match kind {
            StmtKind::Path { value } => out.path = Some((value.clone(), st.span)),
            StmtKind::Params { members } => out.params = r.fields(f, members, &mut Vec::new()).unwrap_or_default(),
            StmtKind::Search { members } => out.search = r.fields(f, members, &mut Vec::new()).unwrap_or_default(),
            StmtKind::Header { members } => out.header = r.fields(f, members, &mut Vec::new()).unwrap_or_default(),
            StmtKind::HeaderReq { members } => out.header_req = r.fields(f, members, &mut Vec::new()).unwrap_or_default(),
            StmtKind::HeaderRes { members } => out.header_res = r.fields(f, members, &mut Vec::new()).unwrap_or_default(),
            StmtKind::Body { ty } => out.body = r.ty(f, ty, Pos::Other),
            StmtKind::Status { code, ty, headers } => {
                if !codes.insert(*code) {
                    r.error(f, st.span, format!("s{code} is duplicated"));
                    continue;
                }
                let Ok(body) = r.status_body(f, st.span, *code, ty) else { continue };
                let hs = match headers {
                    Some(m) => r.fields(f, m, &mut Vec::new()).unwrap_or_default(),
                    None => Vec::new(),
                };
                out.statuses.push((*code, body, hs));
            }
            StmtKind::Wrap { name, off } => out.wraps.push((name.clone(), *off)),
            StmtKind::Cookie { enabled } => out.cookie = Some(*enabled),
            StmtKind::Cache { mode } => {
                if let crate::ast::CacheMode::Cookie { ttl_ms } = mode {
                    if *ttl_ms < 1000 {
                        r.warn(
                            f,
                            st.span,
                            "the ttl of a cookie cache is in whole seconds (values under 1000 ms are rounded up to 1 second)",
                        );
                    }
                }
                out.cache = Some(mode.clone());
            }
            StmtKind::BaseUrl { value } => out.base_url = Some(value.clone()),
            StmtKind::CookieDef { name, settings } => {
                check_cookie_def(&mut r, f, st.span, name, settings);
                out.cookie_def = Some(ir::CookieDef {
                    name: name.clone(),
                    settings: settings.iter().map(|s| (s.key.clone(), s.value.clone())).collect(),
                })
            }
            StmtKind::Wrapper { name, ctx, statuses } => {
                if !wrapper_names.insert(name) {
                    r.error(f, st.span, format!("wrapper `{name}` is duplicated"));
                    continue;
                }
                let ctx_fields = match ctx {
                    Some(m) => r.fields(f, m, &mut Vec::new()).unwrap_or_default(),
                    None => Vec::new(),
                };
                let mut responses = Vec::new();
                let mut seen_codes = HashSet::new();
                for s in statuses {
                    if !seen_codes.insert(s.code) {
                        r.error(f, s.span, format!("s{} is duplicated", s.code));
                        continue;
                    }
                    let Ok(body) = r.status_body(f, s.span, s.code, &s.ty) else { continue };
                    responses.push(ir::Response { status: s.code, body, headers: Vec::new() });
                }
                out.wrappers.push(ir::Wrapper { name: name.clone(), ctx: ctx_fields, responses });
            }
            StmtKind::Import { .. } | StmtKind::Enum { .. } | StmtKind::TypeDecl { .. } => {}
        }
    }
    diags.extend(r.diags);
    out
}

/// Checks the `cookie session { ... }` setting
fn check_cookie_def(r: &mut Resolver, f: &SrcFile, span: Span, name: &str, settings: &[Setting]) {
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        r.error(f, span, format!("invalid cookie name `{name}`"));
    }
    let mut seen = HashSet::new();
    let get = |k: &str| settings.iter().find(|s| s.key == k).map(|s| s.value.as_str());
    for s in settings {
        if !seen.insert(s.key.as_str()) {
            r.error(f, span, format!("cookie setting `{}` is duplicated", s.key));
            continue;
        }
        let ok = match s.key.as_str() {
            "httpOnly" | "secure" => matches!(s.value.as_str(), "true" | "false"),
            "sameSite" => matches!(s.value.as_str(), "lax" | "strict" | "none"),
            "path" | "domain" => !s.value.is_empty(),
            "maxAge" => s.value.parse::<u64>().is_ok(),
            other => {
                r.error(f, span, format!("unknown cookie setting `{other}` (httpOnly, secure, sameSite, path, domain, maxAge)"));
                continue;
            }
        };
        if !ok {
            r.error(f, span, format!("cookie setting {}: `{}` is not a valid value", s.key, s.value));
        }
    }
    if get("sameSite") == Some("none") && get("secure") != Some("true") {
        r.error(f, span, "sameSite: none requires secure: true");
    }
    if let Some(p) = get("path") {
        if !p.starts_with('/') {
            r.error(f, span, "a cookie path must start with `/`");
        }
    }
}

fn type_defs(ws: &Workspace, diags: &mut Vec<Diagnostic>) -> BTreeMap<String, ir::NamedType> {
    let mut r = Resolver { ws, diags: Vec::new() };
    let mut out = BTreeMap::new();
    for f in ws.files.values().flatten() {
        for st in &f.ast.stmts {
            let def = match &st.kind {
                StmtKind::TypeDecl { name, members } => {
                    r.fields(f, members, &mut vec![type_id(f, name)]).map(|fields| (name, ir::TypeDef::Object { fields }))
                }
                StmtKind::Enum { name, variants } => {
                    let mut seen = HashSet::new();
                    for v in variants {
                        if !seen.insert(v) {
                            r.error(f, st.span, format!("value `{v}` of enum `{name}` is duplicated"));
                        }
                    }
                    Some((name, ir::TypeDef::Enum { values: variants.clone() }))
                }
                _ => continue,
            };
            if let Some((name, def)) = def {
                out.insert(type_id(f, name), ir::NamedType { name: name.clone(), source: f.display.clone(), def });
            }
        }
    }
    diags.extend(r.diags);
    out
}

// ---- Building services ----

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = rd.flatten().map(|e| e.path()).collect();
    entries.sort();
    for p in entries {
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with('.') {
            continue;
        }
        if p.is_dir() {
            walk(&p, out);
        } else if p.extension().is_some_and(|e| e == "comat") {
            out.push(p);
        }
    }
}

fn is_group(name: &str) -> bool {
    name.len() > 2 && name.starts_with('(') && name.ends_with(')')
}

fn valid_name(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn build_service(
    base: &Path,
    comat_dir: &Path,
    overlay: Rc<HashMap<PathBuf, String>>,
    statuses: Rc<crate::status::StatusTable>,
) -> (Option<ir::Service>, Vec<Diagnostic>) {
    let mut ws = Workspace { base: base.to_path_buf(), files: BTreeMap::new(), diags: Vec::new(), overlay, statuses };
    let comat_dir = normalize(comat_dir);
    if !comat_dir.is_dir() {
        let d = Diagnostic::error("comatype.config.json", Span::default(), format!("comatDir not found: {}", comat_dir.display()));
        return (None, vec![d]);
    }
    let mut paths = Vec::new();
    walk(&comat_dir, &mut paths);

    let mut roles: HashMap<PathBuf, Role> = HashMap::new();
    let mut diags = Vec::new();
    let mut init_path = None;
    for p in &paths {
        let p = normalize(p);
        let rel = p.strip_prefix(&comat_dir).unwrap().to_path_buf();
        let fname = rel.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let role = match fname {
            "init.comat" if rel.components().count() == 1 => {
                init_path = Some(p.clone());
                Role::Init
            }
            "init.comat" => {
                diags.push(Diagnostic::error(&ws.display(&p), Span::default(), "init.comat can only be placed directly under comatDir"));
                continue;
            }
            "defaults.comat" => Role::Defaults,
            _ => Role::Endpoint,
        };
        roles.insert(p.clone(), role);
        ws.load(&p);
    }
    ws.diags.extend(diags);

    // Among files read via import, those outside comatDir are type-only files
    let all: Vec<PathBuf> = ws.files.keys().cloned().collect();
    for p in &all {
        roles.entry(p.clone()).or_insert(Role::TypeLib);
    }

    let mut diags = Vec::new();
    let mut resolved: HashMap<PathBuf, Resolved> = HashMap::new();
    for (p, f) in ws.files.iter() {
        let Some(f) = f else { continue };
        resolved.insert(p.clone(), resolve_file(&ws, f, roles[p], &mut diags));
    }
    let types = type_defs(&ws, &mut diags);

    // init
    let mut init = Resolved::default();
    if let Some(ip) = &init_path {
        if let Some(r) = resolved.remove(ip) {
            init = r;
        }
    } else {
        diags.push(Diagnostic::warning(
            "comatfiles/init.comat",
            Span::default(),
            "init.comat not found (treated as having no baseUrl and no wrapper declarations)",
        ));
    }
    let wrapper_map: HashMap<&str, &ir::Wrapper> = init.wrappers.iter().map(|w| (w.name.as_str(), w)).collect();

    // Endpoints
    let mut endpoints = Vec::new();
    let mut routes: HashMap<(String, String), String> = HashMap::new();
    let mut modules: HashMap<String, String> = HashMap::new();
    for p in &paths {
        let p = normalize(p);
        if roles.get(&p) != Some(&Role::Endpoint) {
            continue;
        }
        let Some(Some(f)) = ws.files.get(&p) else { continue };
        let Some(me) = resolved.get(&p) else { continue };
        let rel = p.strip_prefix(&comat_dir).unwrap();
        let comps: Vec<String> = rel
            .components()
            .filter_map(|c| match c {
                Component::Normal(s) => s.to_str().map(String::from),
                _ => None,
            })
            .collect();
        let (dirs, file) = comps.split_at(comps.len() - 1);
        let stem = file[0].strip_suffix(".comat").unwrap_or(&file[0]).to_string();
        let rel_disp = comps.join("/");
        let fail = |diags: &mut Vec<Diagnostic>, span: Span, m: String| diags.push(Diagnostic::error(&f.display, span, m));

        // Method and segments. A dynamic part is written as a directory name `[name]` (recommended) or a file name `get_[name]` (deprecated).
        // `get__name` and `get_:name` (a `:` in a file name), and the directory names `:name` and `__name`, are removed. `:name` is allowed in an explicit path.
        // In generated module names, the dynamic part is normalized to `__name` (`[` and `]` cannot be used in each language's import)
        let raw_stem = stem.clone();
        let stem = match raw_stem.split_once('_') {
            Some((m, seg)) if seg.starts_with('[') && seg.ends_with(']') => format!("{m}__{}", &seg[1..seg.len() - 1]),
            _ => raw_stem.clone(),
        };
        if let Some((_, seg)) = raw_stem.split_once('_') {
            if seg.starts_with('_') || seg.starts_with(':') {
                fail(&mut diags, Span::default(), format!("a dynamic segment in the file name `{}` uses a removed syntax (`__name` / `:name`); use a directory name `[name]/{}.comat` (recommended) or `{}_[name].comat`", file[0], raw_stem.split_once('_').unwrap().0, raw_stem.split_once('_').unwrap().0));
                continue;
            }
        }
        let (method, seg) = match stem.split_once('_') {
            Some((m, s)) => (m.to_string(), Some(s.to_string())),
            None => (stem.clone(), None),
        };
        if !METHODS.contains(&method.as_str()) {
            fail(&mut diags, Span::default(), format!("invalid method `{method}` in file name `{}` ({})", file[0], METHODS.join(" / ")));
            continue;
        }
        let mut dir_segs: Vec<String> = Vec::new();
        let mut module_dirs: Vec<String> = Vec::new();
        let mut bad_dir = false;
        for d in dirs.iter().filter(|d| !is_group(d)) {
            if let Some(name) = d.strip_prefix('[').and_then(|x| x.strip_suffix(']')) {
                if !valid_name(name) || name.starts_with('_') {
                    fail(&mut diags, Span::default(), format!("invalid dynamic directory name `{d}` (use `[name]`, where name is alphanumeric, `-` or `_`; catch-all `[...name]` and optional `[[name]]` segments are not supported)"));
                    bad_dir = true;
                }
                dir_segs.push(format!(":{name}"));
                module_dirs.push(format!("__{name}"));
            } else if d.starts_with(':') || d.starts_with("__") {
                fail(
                    &mut diags,
                    Span::default(),
                    format!(
                        "the directory name `{d}` uses a removed syntax; write a dynamic segment as `[{}]`",
                        d.trim_start_matches(':').trim_start_matches('_')
                    ),
                );
                bad_dir = true;
            } else {
                if !valid_name(d) {
                    fail(&mut diags, Span::default(), format!("the directory name `{d}` cannot be used as a path segment"));
                    bad_dir = true;
                }
                dir_segs.push(d.clone());
                module_dirs.push(d.clone());
            }
        }
        if bad_dir {
            continue;
        }
        let module = {
            let mut m: Vec<&str> = module_dirs.iter().map(String::as_str).collect();
            m.push(&stem);
            m.join("/")
        };

        // path
        let mut segs: Vec<String> = Vec::new();
        let route = if let Some((v, span)) = &me.path {
            f_warn(&mut diags, f, *span, "an explicit path is deprecated (let the directory and file name decide it)");
            if let Some(abs) = v.strip_prefix('/') {
                segs.extend(abs.split('/').map(String::from));
            } else if v == "." || v.starts_with("./") {
                segs.extend(dir_segs.iter().map(|s| s.to_string()));
                segs.extend(v[1..].split('/').map(String::from));
            } else {
                fail(&mut diags, *span, format!("path must start with `/` or `./` (`{v}`)"));
                continue;
            }
            normalize_route(segs, &mut diags, f, *span)
        } else {
            segs.extend(dir_segs.iter().map(|s| s.to_string()));
            if let Some(s) = &seg {
                if let Some(name) = s.strip_prefix('_') {
                    if !valid_name(name) || name.starts_with('_') {
                        fail(&mut diags, Span::default(), format!("invalid dynamic path name `{name}` ({})", file[0]));
                        continue;
                    }
                    segs.push(format!(":{name}"));
                } else if valid_name(s) {
                    segs.push(s.clone());
                } else {
                    fail(&mut diags, Span::default(), format!("invalid segment `{s}` ({})", file[0]));
                    continue;
                }
            }
            normalize_route(segs, &mut diags, f, Span::default())
        };
        let Some(route) = route else { continue };

        // params
        let dyn_names: Vec<&str> = route.split('/').filter_map(|s| s.strip_prefix(':')).collect();
        for n in &dyn_names {
            if !me.params.iter().any(|x| &x.name == n) {
                fail(&mut diags, Span::default(), format!("`:{n}` in path is not declared in params"));
            }
        }
        for pf in &me.params {
            if !dyn_names.contains(&pf.name.as_str()) {
                fail(&mut diags, Span::default(), format!("`{}` in params is not in the path ({route})", pf.name));
            }
            if pf.optional {
                fail(&mut diags, Span::default(), format!("`{}` in params cannot be optional", pf.name));
            }
        }

        // Collisions
        if let Some(prev) = routes.insert((method.clone(), route.clone()), rel_disp.clone()) {
            fail(&mut diags, Span::default(), format!("{} {route} duplicates {prev}", method.to_uppercase()));
        }
        if let Some(prev) = modules.insert(module.clone(), rel_disp.clone()) {
            fail(&mut diags, Span::default(), format!("generated module name `{module}` duplicates {prev}"));
        }

        // Merging defaults: comatDir → each directory → the file itself
        let mut chain: Vec<&Resolved> = Vec::new();
        let mut cur = comat_dir.clone();
        let dirs_iter = std::iter::once(None).chain(dirs.iter().map(Some));
        for d in dirs_iter {
            if let Some(d) = d {
                cur = cur.join(d);
            }
            if let Some(r) = resolved.get(&normalize(&cur.join("defaults.comat"))) {
                chain.push(r);
            }
        }
        chain.push(me);

        let mut wraps: Vec<String> = Vec::new();
        let mut cookie = false;
        let (mut h, mut hq, mut hs): (BTreeMap<String, ir::Field>, BTreeMap<String, ir::Field>, BTreeMap<String, ir::Field>) =
            Default::default();
        let mut statuses: BTreeMap<u16, (Option<ir::Type>, Vec<ir::Field>)> = BTreeMap::new();
        for r in &chain {
            for (n, off) in &r.wraps {
                wraps.retain(|w| w != n);
                if !off {
                    wraps.push(n.clone());
                }
            }
            if let Some(c) = r.cookie {
                cookie = c;
            }
            for x in &r.header {
                h.insert(x.name.clone(), x.clone());
            }
            for x in &r.header_req {
                hq.insert(x.name.clone(), x.clone());
            }
            for x in &r.header_res {
                hs.insert(x.name.clone(), x.clone());
            }
            for (code, body, hdr) in &r.statuses {
                statuses.insert(*code, (body.clone(), hdr.clone()));
            }
        }
        for w in &wraps {
            match wrapper_map.get(w.as_str()) {
                Some(def) => {
                    for resp in &def.responses {
                        statuses.entry(resp.status).or_insert((resp.body.clone(), Vec::new()));
                    }
                }
                None => fail(&mut diags, Span::default(), format!("wrap `{w}` is not declared in init.comat")),
            }
        }

        let mut req_headers = h.clone();
        req_headers.extend(hq);
        let mut res_base = h;
        res_base.extend(hs);
        let responses = statuses
            .into_iter()
            .map(|(code, (body, hdr))| {
                let mut m = res_base.clone();
                for x in hdr {
                    m.insert(x.name.clone(), x);
                }
                ir::Response { status: code, body, headers: m.into_values().collect() }
            })
            .collect();

        let cache = match &me.cache {
            Some(c) if !matches!(c, crate::ast::CacheMode::Off) && method != "get" && method != "query" => {
                fail(&mut diags, Span::default(), format!("cache can only be written in get / query endpoints ({method})"));
                None
            }
            c => c.clone(),
        };
        endpoints.push(ir::Endpoint {
            module,
            file: rel_disp,
            method,
            path: route,
            params: me.params.clone(),
            search: me.search.clone(),
            body: me.body.clone(),
            wraps,
            cookie,
            cache,
            request_headers: req_headers.into_values().collect(),
            responses,
        });
    }
    endpoints.sort_by(|a, b| a.module.cmp(&b.module));

    // Spots prone to misconfiguration (can be filtered with `comatype check cache` / `wrap` / `cookie`)
    for e in &endpoints {
        let cached = matches!(&e.cache, Some(c) if !matches!(c, crate::ast::CacheMode::Off));
        if cached && !e.wraps.is_empty() {
            diags.push(Diagnostic::warning(
                &ws.display(&comat_dir.join(&e.file)),
                Span::default(),
                format!(
                    "the endpoint with cache is wrapped by ({}). The client cache key does not include Authorization, so call clearCache() when the user changes. The server cache is looked up before the wrapper, so responses are still served for the ttl after authentication is removed",
                    e.wraps.join(", ")
                ),
            ));
        }
    }
    for w in &init.wrappers {
        if !endpoints.iter().any(|e| e.wraps.contains(&w.name)) {
            diags.push(Diagnostic::warning(
                &ws.display(&comat_dir.join("init.comat")),
                Span::default(),
                format!("wrapper `{}` is not enabled in any endpoint (write wrap {} in defaults.comat or a .comat file)", w.name, w.name),
            ));
        }
    }
    if init.cookie_def.is_none() && endpoints.iter().any(|e| e.cookie) {
        diags.push(Diagnostic::warning(&ws.display(&comat_dir.join("init.comat")), Span::default(), "there are endpoints with cookie on, but init.comat has no cookie declaration (`cookie name { ... }`), so the server cannot issue cookies"));
    }

    // Unused imports
    for f in ws.files.values().flatten() {
        let used = f.used.borrow();
        for (n, (_, sp)) in &f.imports {
            if !used.contains(n) {
                diags.push(Diagnostic::warning(&f.display, *sp, format!("imported `{n}` is not used")));
            }
        }
    }
    diags.append(&mut ws.diags);

    let svc = ir::Service { base_url: init.base_url, cookie: init.cookie_def, wrappers: init.wrappers, types, endpoints };
    (Some(svc), diags)
}

fn f_warn(diags: &mut Vec<Diagnostic>, f: &SrcFile, span: Span, msg: &str) {
    diags.push(Diagnostic::warning(&f.display, span, msg));
}

fn normalize_route(segs: Vec<String>, diags: &mut Vec<Diagnostic>, f: &SrcFile, span: Span) -> Option<String> {
    let mut out: Vec<String> = Vec::new();
    for s in segs {
        match s.as_str() {
            "" | "." => {}
            ".." => {
                diags.push(Diagnostic::error(&f.display, span, "`..` cannot be used in path"));
                return None;
            }
            _ => out.push(s),
        }
    }
    Some(format!("/{}", out.join("/")))
}

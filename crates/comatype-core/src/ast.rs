//! Syntax tree of a `.comat` file. Names are not resolved and nothing is merged yet.

use crate::diag::Span;
use serde::Serialize;

pub const SCALARS: &[&str] = &[
    "string", "bool", "int", "email", "phone", "uuid", "uuidv4", "uuidv7", "date", "datetime", "time", "int64", "decimal", "url", "bytes",
    "json",
];

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Constraint {
    Range { min: Option<i64>, max: Option<i64> },
    Pattern { value: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TypeExpr {
    Scalar {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        constraint: Option<Constraint>,
    },
    Ref {
        name: String,
        span: Span,
    },
    Object {
        members: Vec<Member>,
    },
    Array {
        item: Box<TypeExpr>,
    },
    Union {
        variants: Vec<TypeExpr>,
    },
    Literal {
        value: String,
    },
    Null,
    /// `none`: no response body
    None {
        span: Span,
    },
    /// `empty`: omit the field entirely
    Empty {
        span: Span,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Member {
    Field { name: String, optional: bool, ty: TypeExpr, span: Span },
    Spread { name: String, span: Span },
}

#[derive(Debug, Clone, Serialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

/// `cache off` / `cache 5000` / `cache 5000 cookie`
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum CacheMode {
    /// Never cache
    Off,
    /// In memory for ttl (milliseconds)
    Memory {
        #[serde(rename = "ttlMs")]
        ttl_ms: u64,
    },
    /// In a cookie for ttl (milliseconds) (client only)
    Cookie {
        #[serde(rename = "ttlMs")]
        ttl_ms: u64,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct WrapperStatus {
    pub code: u16,
    /// If omitted, the default body for that status (`{ message: string }`; none for codes without a body)
    pub ty: Option<TypeExpr>,
    pub span: Span,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StmtKind {
    Import {
        names: Vec<String>,
        from: String,
    },
    Enum {
        name: String,
        variants: Vec<String>,
    },
    TypeDecl {
        name: String,
        members: Vec<Member>,
    },
    Path {
        value: String,
    },
    Params {
        members: Vec<Member>,
    },
    Search {
        members: Vec<Member>,
    },
    Header {
        members: Vec<Member>,
    },
    HeaderReq {
        members: Vec<Member>,
    },
    HeaderRes {
        members: Vec<Member>,
    },
    Body {
        ty: TypeExpr,
    },
    /// `s404 ApiError` / `s404` (omitted body type means the default) / `s200 none, { Allow: string[] }`
    Status {
        code: u16,
        ty: Option<TypeExpr>,
        headers: Option<Vec<Member>>,
    },
    Wrap {
        name: String,
        off: bool,
    },
    Cookie {
        enabled: bool,
    },
    Cache {
        mode: CacheMode,
    },
    BaseUrl {
        value: String,
    },
    CookieDef {
        name: String,
        settings: Vec<Setting>,
    },
    Wrapper {
        name: String,
        ctx: Option<Vec<Member>>,
        statuses: Vec<WrapperStatus>,
    },
}

impl StmtKind {
    pub fn keyword(&self) -> &'static str {
        match self {
            StmtKind::Import { .. } => "import",
            StmtKind::Enum { .. } => "enum",
            StmtKind::TypeDecl { .. } => "型の宣言",
            StmtKind::Path { .. } => "path",
            StmtKind::Params { .. } => "params",
            StmtKind::Search { .. } => "search",
            StmtKind::Header { .. } => "header",
            StmtKind::HeaderReq { .. } => "headerReq",
            StmtKind::HeaderRes { .. } => "headerRes",
            StmtKind::Body { .. } => "body",
            StmtKind::Status { .. } => "sNNN",
            StmtKind::Wrap { .. } => "wrap",
            StmtKind::Cookie { .. } => "cookie",
            StmtKind::Cache { .. } => "cache",
            StmtKind::BaseUrl { .. } => "baseUrl",
            StmtKind::CookieDef { .. } => "cookie <name>",
            StmtKind::Wrapper { .. } => "wrapper",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Stmt {
    pub span: Span,
    #[serde(flatten)]
    pub kind: StmtKind,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ComatypeFile {
    pub stmts: Vec<Stmt>,
}

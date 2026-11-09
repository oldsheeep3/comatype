//! IR: a language-independent intermediate representation. Every language generator and runtime reads only this.

use crate::ast::Constraint;
use serde::Serialize;
use std::collections::BTreeMap;

pub const IR_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Type {
    Scalar {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        constraint: Option<Constraint>,
    },
    Ref {
        id: String,
        name: String,
    },
    Object {
        fields: Vec<Field>,
    },
    Array {
        item: Box<Type>,
    },
    Union {
        variants: Vec<Type>,
    },
    Literal {
        value: String,
    },
    Null,
}

#[derive(Debug, Clone, Serialize)]
pub struct Field {
    pub name: String,
    pub optional: bool,
    #[serde(rename = "type")]
    pub ty: Type,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TypeDef {
    Object { fields: Vec<Field> },
    Enum { values: Vec<String> },
}

#[derive(Debug, Clone, Serialize)]
pub struct NamedType {
    pub name: String,
    pub source: String,
    #[serde(flatten)]
    pub def: TypeDef,
}

#[derive(Debug, Clone, Serialize)]
pub struct Response {
    pub status: u16,
    /// null when `none`
    pub body: Option<Type>,
    pub headers: Vec<Field>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Endpoint {
    /// Base of the generated module name (directories without the group + file name). Example: `user/put__id`
    pub module: String,
    /// File location relative to comatDir
    pub file: String,
    pub method: String,
    pub path: String,
    pub params: Vec<Field>,
    pub search: Vec<Field>,
    pub body: Option<Type>,
    /// Outermost first
    pub wraps: Vec<String>,
    pub cookie: bool,
    /// The `cache` setting (GET / QUERY endpoints only; null if absent = no caching)
    pub cache: Option<crate::ast::CacheMode>,
    pub request_headers: Vec<Field>,
    pub responses: Vec<Response>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CookieDef {
    pub name: String,
    pub settings: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Wrapper {
    pub name: String,
    pub ctx: Vec<Field>,
    pub responses: Vec<Response>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Service {
    pub base_url: Option<String>,
    pub cookie: Option<CookieDef>,
    pub wrappers: Vec<Wrapper>,
    pub types: BTreeMap<String, NamedType>,
    pub endpoints: Vec<Endpoint>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Ir {
    pub version: u32,
    pub services: BTreeMap<String, Service>,
}

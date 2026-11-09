//! IR (the result of comatype check) → OpenAPI 3.0.3.

use comatype_core::ast::Constraint;
use comatype_core::ir::*;
use comatype_core::status::StatusTable;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

/// Extension used to restore the original type on a round trip (OpenAPI → comat)
pub const EXT: &str = "x-comatype";

fn obj(pairs: Vec<(&str, Value)>) -> Value {
    let mut m = Map::new();
    for (k, v) in pairs {
        m.insert(k.to_string(), v);
    }
    Value::Object(m)
}

fn scalar(name: &str, constraint: &Option<Constraint>) -> Value {
    let mut m = match name {
        "string" => obj(vec![("type", json!("string"))]),
        "bool" => obj(vec![("type", json!("boolean"))]),
        "int" => obj(vec![("type", json!("integer"))]),
        "email" => obj(vec![("type", json!("string")), ("format", json!("email"))]),
        "phone" => obj(vec![("type", json!("string")), ("pattern", json!("^\\+[1-9]\\d{1,14}$")), (EXT, json!("phone"))]),
        "uuid" => obj(vec![("type", json!("string")), ("format", json!("uuid"))]),
        "uuidv4" | "uuidv7" => obj(vec![("type", json!("string")), ("format", json!("uuid")), (EXT, json!(name))]),
        "date" => obj(vec![("type", json!("string")), ("format", json!("date"))]),
        "datetime" => obj(vec![("type", json!("string")), ("format", json!("date-time"))]),
        "time" => obj(vec![("type", json!("string")), ("format", json!("time"))]),
        "int64" => obj(vec![
            ("type", json!("string")),
            ("pattern", json!("^-?\\d+$")),
            ("description", json!("64-bit integer (a string on the wire)")),
            (EXT, json!("int64")),
        ]),
        "decimal" => obj(vec![
            ("type", json!("string")),
            ("pattern", json!("^-?\\d+(\\.\\d+)?$")),
            ("description", json!("decimal number (a string on the wire)")),
            (EXT, json!("decimal")),
        ]),
        "url" => obj(vec![("type", json!("string")), ("format", json!("uri"))]),
        "bytes" => obj(vec![("type", json!("string")), ("format", json!("byte"))]),
        _ => obj(vec![(EXT, json!("json"))]), // json: any value
    };
    if let (Some(c), Value::Object(map)) = (constraint, &mut m) {
        match c {
            Constraint::Range { min, max } => {
                let (lo, hi) = if name == "string" { ("minLength", "maxLength") } else { ("minimum", "maximum") };
                if matches!(name, "string" | "int") {
                    if let Some(v) = min {
                        map.insert(lo.into(), json!(v));
                    }
                    if let Some(v) = max {
                        map.insert(hi.into(), json!(v));
                    }
                }
            }
            Constraint::Pattern { value } => {
                map.insert("pattern".into(), json!(value));
            }
        }
    }
    m
}

struct Ctx {
    names: BTreeMap<String, String>,
}

impl Ctx {
    fn schema(&self, t: &Type) -> Value {
        match t {
            Type::Scalar { name, constraint } => scalar(name, constraint),
            Type::Ref { id, name } => json!({"$ref": format!("#/components/schemas/{}", self.names.get(id).unwrap_or(name))}),
            Type::Object { fields } => self.object(fields),
            Type::Array { item } => json!({"type": "array", "items": self.schema(item)}),
            Type::Literal { value } => json!({"type": "string", "enum": [value]}),
            Type::Null => json!({"nullable": true}),
            Type::Union { variants } => {
                let nullable = variants.iter().any(|v| matches!(v, Type::Null));
                let rest: Vec<&Type> = variants.iter().filter(|v| !matches!(v, Type::Null)).collect();
                let mut s = if !rest.is_empty() && rest.iter().all(|v| matches!(v, Type::Literal { .. })) {
                    let vals: Vec<&str> = rest.iter().map(|v| if let Type::Literal { value } = v { value.as_str() } else { "" }).collect();
                    json!({"type": "string", "enum": vals})
                } else if rest.len() == 1 {
                    let inner = self.schema(rest[0]);
                    if inner.get("$ref").is_some() {
                        json!({"allOf": [inner]})
                    } else {
                        inner
                    }
                } else {
                    json!({"oneOf": rest.iter().map(|v| self.schema(v)).collect::<Vec<_>>()})
                };
                if nullable {
                    s.as_object_mut().unwrap().insert("nullable".into(), json!(true));
                }
                s
            }
        }
    }

    fn object(&self, fields: &[Field]) -> Value {
        let mut props = Map::new();
        let mut required = Vec::new();
        for f in fields {
            props.insert(f.name.clone(), self.schema(&f.ty));
            if !f.optional {
                required.push(json!(f.name));
            }
        }
        let mut m = obj(vec![("type", json!("object")), ("properties", Value::Object(props))]);
        if !required.is_empty() {
            m.as_object_mut().unwrap().insert("required".into(), Value::Array(required));
        }
        m
    }

    fn parameters(&self, kind: &str, fields: &[Field], always_required: bool) -> Vec<Value> {
        fields
            .iter()
            .map(|f| json!({"name": f.name, "in": kind, "required": always_required || !f.optional, "schema": self.schema(&f.ty)}))
            .collect()
    }

    fn response(&self, r: &Response, statuses: &StatusTable) -> Value {
        let msg = statuses.get(&r.status).cloned().unwrap_or_else(|| format!("Status {}", r.status));
        let mut m = obj(vec![("description", json!(msg))]);
        let mo = m.as_object_mut().unwrap();
        if !r.headers.is_empty() {
            let mut hs = Map::new();
            for h in &r.headers {
                let mut one = Map::new();
                if !h.optional {
                    one.insert("required".into(), json!(true));
                }
                one.insert("schema".into(), self.schema(&h.ty));
                hs.insert(h.name.clone(), Value::Object(one));
            }
            mo.insert("headers".into(), Value::Object(hs));
        }
        if let Some(b) = &r.body {
            mo.insert("content".into(), json!({"application/json": {"schema": self.schema(b)}}));
        }
        m
    }
}

/// OpenAPI path (`/user/:id` → `/user/{id}`)
fn openapi_path(p: &str) -> String {
    p.split('/').map(|s| if let Some(n) = s.strip_prefix(':') { format!("{{{n}}}") } else { s.to_string() }).collect::<Vec<_>>().join("/")
}

pub fn export(title: &str, svc: &Service, statuses: &StatusTable) -> Value {
    // Schema names must be unique
    let mut names = BTreeMap::new();
    let mut used = std::collections::BTreeSet::new();
    for (id, nt) in &svc.types {
        let mut n = nt.name.clone();
        let mut i = 2;
        while !used.insert(n.clone()) {
            n = format!("{}{i}", nt.name);
            i += 1;
        }
        names.insert(id.clone(), n);
    }
    let cx = Ctx { names };

    let mut schemas = Map::new();
    for (id, nt) in &svc.types {
        let s = match &nt.def {
            TypeDef::Object { fields } => cx.object(fields),
            TypeDef::Enum { values } => json!({"type": "string", "enum": values}),
        };
        schemas.insert(cx.names[id].clone(), s);
    }

    let mut paths: BTreeMap<String, Map<String, Value>> = BTreeMap::new();
    for ep in &svc.endpoints {
        let mut op = Map::new();
        op.insert("operationId".into(), json!(ep.module.replace('/', "_")));
        if let Some((dir, _)) = ep.module.split_once('/') {
            op.insert("tags".into(), json!([dir]));
        }
        let mut params = cx.parameters("path", &ep.params, true);
        params.extend(cx.parameters("query", &ep.search, false));
        params.extend(cx.parameters("header", &ep.request_headers, false));
        if !params.is_empty() {
            op.insert("parameters".into(), Value::Array(params));
        }
        if let Some(b) = &ep.body {
            op.insert("requestBody".into(), json!({"required": true, "content": {"application/json": {"schema": cx.schema(b)}}}));
        }
        let mut responses = Map::new();
        for r in &ep.responses {
            responses.insert(r.status.to_string(), cx.response(r, statuses));
        }
        op.insert("responses".into(), Value::Object(responses));
        if !ep.wraps.is_empty() {
            op.insert("x-comatype-wraps".into(), json!(ep.wraps));
        }
        if ep.cookie {
            op.insert("x-comatype-cookie".into(), json!(true));
        }
        // OpenAPI 3.0 has no QUERY method, so it goes in an extension key
        let key = if ep.method == "query" { "x-comatype-query".to_string() } else { ep.method.clone() };
        paths.entry(openapi_path(&ep.path)).or_default().insert(key, Value::Object(op));
    }

    let mut doc = Map::new();
    doc.insert("openapi".into(), json!("3.0.3"));
    doc.insert("info".into(), json!({"title": title, "version": "1.0.0", "description": "Generated from Comatype"}));
    if let Some(u) = &svc.base_url {
        doc.insert("servers".into(), json!([{"url": u}]));
    }
    doc.insert("paths".into(), Value::Object(paths.into_iter().map(|(k, v)| (k, Value::Object(v))).collect()));
    doc.insert("components".into(), json!({"schemas": Value::Object(schemas)}));
    Value::Object(doc)
}

pub fn to_yaml(v: &Value) -> String {
    serde_yaml::to_string(v).expect("every value can be written as YAML")
}

//! OpenAPI 3 (YAML / JSON) → a set of `.comat` files.
//!
//! Types go to `types/<Name>.comat` and endpoints under `comatfiles/` (directories and file names come from the path and method),
//! and project-wide settings go to `comatfiles/init.comat`. What cannot be expressed (number, map, a union inside an array, ...) becomes
//! `json` and is reported in `warnings`.

use comatype_core::status::{no_body, StatusTable};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Default)]
pub struct Imported {
    /// Path relative to the output directory → contents
    pub files: Vec<(String, String)>,
    /// Status codes not in the standard set (added to additionalStatusCodes in the config)
    pub additional_status_codes: Vec<(u16, String)>,
    pub warnings: Vec<String>,
    pub base_url: Option<String>,
    pub title: String,
}

/// Reads YAML or JSON text (JSON is a subset of YAML). Numeric keys such as `200:` become strings
pub fn parse_document(text: &str) -> Result<Value, String> {
    let y: serde_yaml::Value = serde_yaml::from_str(text).map_err(|e| format!("YAML / JSON として読めません: {e}"))?;
    Ok(yaml_to_json(y))
}

fn yaml_to_json(y: serde_yaml::Value) -> Value {
    use serde_yaml::Value as Y;
    match y {
        Y::Null => Value::Null,
        Y::Bool(b) => Value::Bool(b),
        Y::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::from(i)
            } else if let Some(u) = n.as_u64() {
                Value::from(u)
            } else {
                Value::from(n.as_f64().unwrap_or(0.0))
            }
        }
        Y::String(s) => Value::String(s),
        Y::Sequence(v) => Value::Array(v.into_iter().map(yaml_to_json).collect()),
        Y::Mapping(m) => {
            let mut out = serde_json::Map::new();
            for (k, v) in m {
                let key = match k {
                    Y::String(s) => s,
                    Y::Number(n) => n.to_string(),
                    Y::Bool(b) => b.to_string(),
                    other => format!("{other:?}"),
                };
                out.insert(key, yaml_to_json(v));
            }
            Value::Object(out)
        }
        Y::Tagged(t) => yaml_to_json(t.value),
    }
}

fn is_ident(s: &str) -> bool {
    let mut cs = s.chars();
    matches!(cs.next(), Some(c) if c.is_ascii_alphabetic() || c == '_') && cs.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Keeps only alphanumerics and `_` (prefixes `_` if it starts with a digit)
fn sanitize_ident(s: &str) -> String {
    let mut out: String = s.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' }).collect();
    if out.is_empty() || out.chars().next().unwrap().is_ascii_digit() {
        out.insert(0, '_');
    }
    out
}

fn type_name(s: &str) -> String {
    let n = sanitize_ident(s);
    let n = n.trim_start_matches('_');
    let mut cs = n.chars();
    match cs.next() {
        Some(f) => f.to_ascii_uppercase().to_string() + cs.as_str(),
        None => "Type".into(),
    }
}

fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn key(name: &str) -> String {
    if is_ident(name) { name.to_string() } else { quote(name) }
}

#[derive(Clone, Debug, PartialEq)]
enum Kind {
    Object,
    Enum(Vec<String>),
    Alias,
}

struct Conv<'a> {
    doc: &'a Value,
    kinds: BTreeMap<String, Kind>,
    names: BTreeMap<String, String>,
    deps: BTreeSet<String>,
    warnings: Vec<String>,
    place: String,
}

impl<'a> Conv<'a> {
    fn lookup(&self, path: &str) -> Option<&'a Value> {
        let mut cur = self.doc;
        for part in path.strip_prefix("#/")?.split('/') {
            cur = cur.get(part.replace("~1", "/").replace("~0", "~"))?;
        }
        Some(cur)
    }

    fn warn(&mut self, msg: impl Into<String>) {
        let m = format!("{}: {}", self.place, msg.into());
        if !self.warnings.contains(&m) {
            self.warnings.push(m);
        }
    }

    /// Name in components/schemas that the `$ref` points to
    fn schema_name<'b>(&self, r: &'b str) -> Option<&'b str> {
        r.strip_prefix("#/components/schemas/")
    }

    fn expr(&mut self, s: &Value, indent: usize, depth: usize) -> String {
        if depth > 12 {
            self.warn("型の入れ子が深すぎるので json にしました");
            return "json".into();
        }
        if let Some(r) = s.get("$ref").and_then(Value::as_str) {
            return match self.schema_name(r).map(str::to_string) {
                Some(n) => match self.kinds.get(&n).cloned() {
                    Some(Kind::Alias) => match self.lookup(r) {
                        Some(t) => self.expr(t, indent, depth + 1),
                        None => "json".into(),
                    },
                    Some(_) => {
                        self.deps.insert(n.clone());
                        self.names[&n].clone()
                    }
                    None => {
                        self.warn(format!("{r} が見つからないので json にしました"));
                        "json".into()
                    }
                },
                None => match self.lookup(r) {
                    Some(t) => self.expr(t, indent, depth + 1),
                    None => {
                        self.warn(format!("{r} が見つからないので json にしました"));
                        "json".into()
                    }
                },
            };
        }
        // OpenAPI 3.1: type: [string, "null"]
        let mut nullable = s.get("nullable").and_then(Value::as_bool).unwrap_or(false);
        let mut ty = s.get("type").and_then(Value::as_str).map(str::to_string);
        if let Some(arr) = s.get("type").and_then(Value::as_array) {
            let non_null: Vec<&str> = arr.iter().filter_map(Value::as_str).filter(|t| *t != "null").collect();
            nullable |= arr.iter().any(|t| t == "null");
            ty = if non_null.len() == 1 { Some(non_null[0].to_string()) } else { None };
        }
        let base = self.base_expr(s, ty.as_deref(), indent, depth, &mut nullable);
        if nullable && base != "json" && !base.ends_with("| null") {
            format!("{base} | null")
        } else {
            base
        }
    }

    fn base_expr(&mut self, s: &Value, ty: Option<&str>, indent: usize, depth: usize, nullable: &mut bool) -> String {
        if let Some(all) = s.get("allOf").and_then(Value::as_array) {
            if all.len() == 1 && s.get("properties").is_none() {
                return self.expr(&all[0], indent, depth + 1);
            }
            return self.object_expr(s, indent, depth);
        }
        for k in ["oneOf", "anyOf"] {
            if let Some(items) = s.get(k).and_then(Value::as_array) {
                let mut parts = Vec::new();
                for it in items {
                    if it.get("type").and_then(Value::as_str) == Some("null") {
                        *nullable = true;
                        continue;
                    }
                    parts.push(self.expr(it, indent, depth + 1));
                }
                return match parts.len() {
                    0 => "json".into(),
                    1 => parts.remove(0),
                    _ => parts.join(" | "),
                };
            }
        }
        if let Some(values) = s.get("enum").and_then(Value::as_array) {
            let strs: Vec<&str> = values.iter().filter_map(Value::as_str).collect();
            if !strs.is_empty() && strs.len() == values.iter().filter(|v| !v.is_null()).count() {
                if values.iter().any(Value::is_null) {
                    *nullable = true;
                }
                return strs.iter().map(|v| quote(v)).collect::<Vec<_>>().join(" | ");
            }
            self.warn("文字列以外の enum は、元の型にしました");
        }
        if let Some(c) = s.get("const").and_then(Value::as_str) {
            return quote(c);
        }
        match ty {
            Some("object") => self.object_expr(s, indent, depth),
            None if s.get("properties").is_some() => self.object_expr(s, indent, depth),
            Some("array") => {
                let item = match s.get("items") {
                    Some(it) => self.expr(it, indent, depth + 1),
                    None => "json".into(),
                };
                if item.contains(" | ") {
                    self.warn("ユニオンの配列は表せないので、json[] にしました");
                    "json[]".into()
                } else {
                    format!("{item}[]")
                }
            }
            Some("string") => self.string_expr(s),
            Some("integer") => {
                let (lo, hi) = (s.get("minimum").and_then(Value::as_i64), s.get("maximum").and_then(Value::as_i64));
                match (lo, hi) {
                    (None, None) => "int".into(),
                    _ => format!("int({}..{})", lo.map(|v| v.to_string()).unwrap_or_default(), hi.map(|v| v.to_string()).unwrap_or_default()),
                }
            }
            Some("number") => {
                self.warn("number（小数）は表せないので json にしました（金額などは decimal を使います）");
                "json".into()
            }
            Some("boolean") => "bool".into(),
            _ => match s.get(super::export::EXT).and_then(Value::as_str) {
                Some("json") | None => "json".into(),
                Some(other) => other.to_string(),
            },
        }
    }

    fn string_expr(&mut self, s: &Value) -> String {
        if let Some(ext) = s.get(super::export::EXT).and_then(Value::as_str) {
            if ["phone", "uuidv4", "uuidv7", "int64", "decimal", "time"].contains(&ext) {
                return ext.to_string();
            }
        }
        match s.get("format").and_then(Value::as_str) {
            Some("email") => return "email".into(),
            Some("uuid") => return "uuid".into(),
            Some("date") => return "date".into(),
            Some("date-time") => return "datetime".into(),
            Some("time") => return "time".into(),
            Some("uri") | Some("url") => return "url".into(),
            Some("byte") | Some("binary") => return "bytes".into(),
            _ => {}
        }
        if let Some(p) = s.get("pattern").and_then(Value::as_str) {
            return format!("string(pattern: {})", quote(p));
        }
        let (lo, hi) = (s.get("minLength").and_then(Value::as_i64), s.get("maxLength").and_then(Value::as_i64));
        match (lo, hi) {
            (None, None) => "string".into(),
            _ => format!("string({}..{})", lo.map(|v| v.to_string()).unwrap_or_default(), hi.map(|v| v.to_string()).unwrap_or_default()),
        }
    }

    /// `{ ... }` (multi-line). allOf is expanded with `...Name`
    fn object_expr(&mut self, s: &Value, indent: usize, depth: usize) -> String {
        let lines = self.fields(s, indent + 1, depth);
        if lines.is_empty() {
            if s.get("additionalProperties").is_some() {
                self.warn("additionalProperties（map）は表せないので json にしました");
            }
            return "json".into();
        }
        format!("{{\n{}\n{}}}", lines.join("\n"), "    ".repeat(indent))
    }

    fn fields(&mut self, s: &Value, indent: usize, depth: usize) -> Vec<String> {
        let pad = "    ".repeat(indent);
        let mut lines = Vec::new();
        if let Some(all) = s.get("allOf").and_then(Value::as_array) {
            for part in all {
                let target = part.get("$ref").and_then(Value::as_str).and_then(|r| self.schema_name(r).map(str::to_string));
                match target {
                    Some(n) if self.kinds.get(&n) == Some(&Kind::Object) => {
                        self.deps.insert(n.clone());
                        lines.push(format!("{pad}...{},", self.names[&n]));
                    }
                    Some(n) => {
                        if let Some(t) = self.lookup(&format!("#/components/schemas/{n}")) {
                            lines.extend(self.fields(t, indent, depth + 1));
                        }
                    }
                    None => lines.extend(self.fields(part, indent, depth + 1)),
                }
            }
        }
        let required: BTreeSet<&str> = s.get("required").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
        if let Some(props) = s.get("properties").and_then(Value::as_object) {
            for (name, ps) in props {
                let e = self.expr(ps, indent, depth + 1);
                lines.push(format!("{pad}{}{}: {e},", key(name), if required.contains(name.as_str()) { "" } else { "?" }));
            }
        }
        lines
    }
}

const SKIP_HEADERS: &[&str] = &["accept", "content-type", "authorization"];

struct Param {
    name: String,
    location: String,
    required: bool,
    schema: Value,
}

fn collect_params(cv: &Conv, item: &Value, op: &Value) -> Vec<Param> {
    let mut out: Vec<Param> = Vec::new();
    for src in [item.get("parameters"), op.get("parameters")].into_iter().flatten().filter_map(Value::as_array) {
        for p in src {
            let p = match p.get("$ref").and_then(Value::as_str) {
                Some(r) => cv.lookup(r).unwrap_or(p),
                None => p,
            };
            let (Some(name), Some(loc)) = (p.get("name").and_then(Value::as_str), p.get("in").and_then(Value::as_str)) else { continue };
            let param = Param {
                name: name.to_string(),
                location: loc.to_string(),
                required: p.get("required").and_then(Value::as_bool).unwrap_or(loc == "path"),
                schema: p.get("schema").cloned().unwrap_or_else(|| Value::Object(Default::default())),
            };
            out.retain(|x| !(x.name == param.name && x.location == param.location));
            out.push(param);
        }
    }
    out
}

fn block(cv: &mut Conv, kw: &str, params: &[&Param]) -> String {
    let mut s = format!("{kw} {{\n");
    for p in params {
        let e = cv.expr(&p.schema, 1, 0);
        s.push_str(&format!("    {}{}: {e},\n", key(&p.name), if p.required { "" } else { "?" }));
    }
    s.push_str("}\n");
    s
}

/// Body type. Only JSON content types (application/json etc.). Err(true) if there is only non-JSON, Err(false) if content is empty
fn json_schema(content: &Value) -> Result<&Value, bool> {
    let m = content.as_object().filter(|m| !m.is_empty()).ok_or(false)?;
    let pick = m
        .get("application/json")
        .or_else(|| m.iter().find(|(k, _)| k.contains("json")).map(|(_, v)| v))
        .ok_or(true)?;
    pick.get("schema").ok_or(false)
}

/// Whether the body is just `{ message: string }` (same as the default body)
fn is_default_body(s: &Value) -> bool {
    s.get("type").and_then(Value::as_str) == Some("object")
        && s.get("properties").and_then(Value::as_object).map_or(false, |p| {
            p.len() == 1
                && p.get("message").map_or(false, |m| {
                    m.get("type").and_then(Value::as_str) == Some("string")
                        && m.get("format").is_none()
                        && m.get("pattern").is_none()
                        && m.get("enum").is_none()
                })
        })
        && s.get("required").and_then(Value::as_array).map_or(false, |r| r.len() == 1 && r[0] == "message")
}

fn imports_for(deps: &BTreeSet<String>, names: &BTreeMap<String, String>, prefix: &str) -> String {
    let mut s = String::new();
    for d in deps {
        s.push_str(&format!("import {} from {prefix}{}.comat\n", names[d], names[d]));
    }
    if !s.is_empty() {
        s.push('\n');
    }
    s
}

pub fn import(doc: &Value, statuses: &StatusTable) -> Result<Imported, String> {
    if doc.get("openapi").and_then(Value::as_str).map_or(true, |v| !v.starts_with('3')) {
        return Err("OpenAPI 3 の文書ではありません（`openapi: 3.x` がありません）".into());
    }
    let mut out = Imported::default();
    out.title = doc["info"]["title"].as_str().unwrap_or("api").to_string();
    out.base_url = doc["servers"][0]["url"].as_str().filter(|u| u.starts_with("http") && !u.contains('{')).map(str::to_string);

    // Classify types and name them
    let schemas = doc["components"]["schemas"].as_object().cloned().unwrap_or_default();
    let mut cv = Conv { doc, kinds: BTreeMap::new(), names: BTreeMap::new(), deps: BTreeSet::new(), warnings: vec![], place: String::new() };
    let mut used = BTreeSet::new();
    for (name, s) in &schemas {
        let kind = if let Some(values) = s.get("enum").and_then(Value::as_array).filter(|_| s.get("properties").is_none()) {
            let strs: Vec<String> = values.iter().filter_map(Value::as_str).map(str::to_string).collect();
            if !strs.is_empty() && strs.len() == values.len() && strs.iter().all(|v| is_ident(v)) { Kind::Enum(strs) } else { Kind::Alias }
        } else if s.get("properties").is_some() || s.get("allOf").and_then(Value::as_array).map_or(false, |a| a.len() > 1 || s.get("properties").is_some()) || s.get("type").and_then(Value::as_str) == Some("object") && s.get("additionalProperties").is_none() {
            Kind::Object
        } else {
            Kind::Alias
        };
        cv.kinds.insert(name.clone(), kind);
        let mut n = type_name(name);
        let mut i = 2;
        while !used.insert(n.clone()) {
            n = format!("{}{i}", type_name(name));
            i += 1;
        }
        cv.names.insert(name.clone(), n);
    }

    // types/<Name>.comat
    for (name, s) in &schemas {
        cv.place = format!("components.schemas.{name}");
        cv.deps.clear();
        let ident = cv.names[name].clone();
        let body = match cv.kinds[name].clone() {
            Kind::Alias => continue,
            Kind::Enum(values) => format!("enum {ident} {{\n{}\n}}\n", values.iter().map(|v| format!("    {v},")).collect::<Vec<_>>().join("\n")),
            Kind::Object => {
                let lines = cv.fields(s, 1, 0);
                format!("{ident} {{\n{}\n}}\n", lines.join("\n"))
            }
        };
        let mut deps = cv.deps.clone();
        deps.remove(name);
        let text = format!("{}{body}", imports_for(&deps, &cv.names, "./"));
        out.files.push((format!("types/{ident}.comat"), text));
    }

    // Endpoints
    let mut taken: BTreeSet<String> = BTreeSet::new();
    let mut additional: BTreeMap<u16, String> = BTreeMap::new();
    let methods = ["get", "post", "put", "patch", "delete", "options", "head"];
    let paths = doc["paths"].as_object().cloned().unwrap_or_default();
    for (path, item) in &paths {
        let mut ops: Vec<(String, &Value)> = Vec::new();
        for m in methods {
            if let Some(op) = item.get(m) {
                ops.push((m.to_string(), op));
            }
        }
        if let Some(op) = item.get("x-comatype-query") {
            ops.push(("query".into(), op));
        }
        if item.get("trace").is_some() {
            cv.warnings.push(format!("{path}: trace は未対応なので読み飛ばしました"));
        }
        for (method, op) in ops {
            cv.place = format!("{} {path}", method.to_uppercase());
            cv.deps.clear();
            let params = collect_params(&cv, item, op);
            let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
            let dynamic = |s: &str| s.starts_with('{') && s.ends_with('}');
            let derivable = segs.iter().take(segs.len().saturating_sub(1)).all(|s| !dynamic(s));

            // File location and explicit path
            let mut explicit: Option<String> = None;
            let (dir, mut stem) = if derivable {
                let dirs: Vec<String> = segs.iter().take(segs.len().saturating_sub(1)).map(|s| s.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect()).collect();
                let stem = match segs.last() {
                    None => method.clone(),
                    Some(s) if dynamic(s) => format!("{method}_[{}]", sanitize_ident(&s[1..s.len() - 1])),
                    Some(s) => format!("{method}_{}", s.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect::<String>()),
                };
                (dirs.join("/"), stem)
            } else {
                let p = segs.iter().map(|s| if dynamic(s) { format!(":{}", sanitize_ident(&s[1..s.len() - 1])) } else { s.to_string() }).collect::<Vec<_>>().join("/");
                explicit = Some(format!("/{p}"));
                let flat = op.get("operationId").and_then(Value::as_str).map(sanitize_ident).unwrap_or_else(|| sanitize_ident(&segs.join("_")));
                (String::new(), format!("{method}_{flat}"))
            };
            let base = stem.clone();
            let mut n = 2;
            while !taken.insert(format!("{dir}/{stem}")) {
                stem = format!("{base}{n}");
                n += 1;
            }
            let rel = if dir.is_empty() { format!("comatfiles/{stem}.comat") } else { format!("comatfiles/{dir}/{stem}.comat") };
            let depth = dir.split('/').filter(|s| !s.is_empty()).count();
            let prefix = format!("{}types/", "../".repeat(depth + 1));

            let mut body = String::new();
            if let Some(p) = &explicit {
                body.push_str(&format!("path {p}\n\n"));
            }
            // params (in path order)
            let path_params: Vec<(String, Value)> = segs
                .iter()
                .filter(|s| dynamic(s))
                .map(|s| {
                    let raw = &s[1..s.len() - 1];
                    let schema = params.iter().find(|p| p.location == "path" && p.name == raw).map(|p| p.schema.clone()).unwrap_or_else(|| serde_json::json!({"type": "string"}));
                    (sanitize_ident(raw), schema)
                })
                .collect();
            if !path_params.is_empty() {
                let mut s = String::from("params {\n");
                for (name, schema) in &path_params {
                    let e = cv.expr(schema, 1, 0);
                    s.push_str(&format!("    {name}: {e},\n"));
                }
                s.push_str("}\n\n");
                body.push_str(&s);
            }
            let query: Vec<&Param> = params.iter().filter(|p| p.location == "query").collect();
            if !query.is_empty() {
                body.push_str(&block(&mut cv, "search", &query));
                body.push('\n');
            }
            let headers: Vec<&Param> = params.iter().filter(|p| p.location == "header" && !SKIP_HEADERS.contains(&p.name.to_ascii_lowercase().as_str())).collect();
            if !headers.is_empty() {
                body.push_str(&block(&mut cv, "headerReq", &headers));
                body.push('\n');
            }
            if let Some(rb) = op.get("requestBody") {
                let rb = match rb.get("$ref").and_then(Value::as_str) {
                    Some(r) => cv.lookup(r).unwrap_or(rb),
                    None => rb,
                };
                match rb.get("content").map(json_schema).unwrap_or(Err(false)) {
                    Ok(sch) => {
                        let e = cv.expr(sch, 0, 0);
                        body.push_str(&format!("body {e}\n\n"));
                    }
                    Err(_) => {
                        cv.warn("JSON ではないリクエストボディは json にしました");
                        body.push_str("body json\n\n");
                    }
                }
            }
            // Responses
            let responses = op.get("responses").and_then(Value::as_object).cloned().unwrap_or_default();
            if responses.is_empty() {
                cv.warn("responses がありません");
            }
            for (code, r) in &responses {
                let Ok(code_n) = code.parse::<u16>() else {
                    cv.warn(format!("レスポンス `{code}`（default や 2XX など）は読み飛ばしました。ステータスコードを書いてください"));
                    continue;
                };
                if !(100..=599).contains(&code_n) {
                    cv.warn(format!("ステータスコード {code} は範囲外なので読み飛ばしました"));
                    continue;
                }
                let r = match r.get("$ref").and_then(Value::as_str) {
                    Some(rr) => cv.lookup(rr).unwrap_or(r),
                    None => r,
                };
                if !statuses.contains_key(&code_n) {
                    let desc = r.get("description").and_then(Value::as_str).map(str::trim).filter(|d| !d.is_empty()).map(str::to_string).unwrap_or_else(|| format!("Status {code_n}"));
                    additional.entry(code_n).or_insert(desc);
                }
                let schema = match r.get("content").map(json_schema).unwrap_or(Err(false)) {
                    Ok(sch) => Some(sch),
                    Err(true) => {
                        cv.warn(format!("{code_n} の JSON ではないレスポンスは、本文なしにしました"));
                        None
                    }
                    Err(false) => None,
                };
                let mut line = format!("s{code_n}");
                if no_body(code_n) {
                    if schema.is_some() {
                        cv.warn(format!("{code_n} は本文を持てないので、本文は読み飛ばしました"));
                    }
                    line.push_str(" none");
                } else {
                    match schema {
                        Some(sch) if is_default_body(sch) => {} // Default body: omit the type
                        Some(sch) => {
                            let e = cv.expr(sch, 0, 0);
                            line.push_str(&format!(" {e}"));
                        }
                        None => line.push_str(" none"),
                    }
                }
                let hs: Vec<(String, bool, Value)> = r
                    .get("headers")
                    .and_then(Value::as_object)
                    .map(|m| {
                        m.iter()
                            .filter(|(k, _)| !SKIP_HEADERS.contains(&k.to_ascii_lowercase().as_str()) && k.to_ascii_lowercase() != "set-cookie")
                            .map(|(k, v)| (k.clone(), v.get("required").and_then(Value::as_bool).unwrap_or(false), v.get("schema").cloned().unwrap_or(serde_json::json!({"type": "string"}))))
                            .collect()
                    })
                    .unwrap_or_default();
                if !hs.is_empty() {
                    let mut block = String::from(", {\n");
                    for (k, req, sch) in &hs {
                        let e = cv.expr(sch, 1, 0);
                        block.push_str(&format!("    {}{}: {e},\n", key(k), if *req { "" } else { "?" }));
                    }
                    block.push('}');
                    line.push_str(&block);
                }
                body.push_str(&line);
                body.push('\n');
            }
            let text = format!("{}{}", imports_for(&cv.deps.clone(), &cv.names, &prefix), body.trim_end().to_string() + "\n");
            out.files.push((rel, text));
        }
    }

    out.files.push((
        "comatfiles/init.comat".into(),
        match &out.base_url {
            Some(u) => format!("baseUrl {u}\n"),
            None => "// プロジェクト固有の設定（baseUrl、wrapper、cookie）をここに書く\n".to_string(),
        },
    ));
    out.additional_status_codes = additional.into_iter().collect();
    out.warnings = cv.warnings;
    out.files.sort();
    Ok(out)
}

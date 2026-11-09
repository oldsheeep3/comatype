//! `comatype endpoints`: lists the configured endpoints. Colors those that share the same wrap, and `--group` separates them by wrap.

use comatype_core::ast::{CacheMode, Constraint};
use comatype_core::ir::{Endpoint, Field, Ir, Type};
use std::collections::BTreeMap;

pub struct Options {
    /// `--all`: besides the method, also shows request / response types and so on
    pub all: bool,
    /// `--group`: separate by wrap (exact match including order)
    pub group: bool,
    pub color: bool,
}

const PALETTE: &[&str] = &["32", "31", "33", "34", "35", "36", "92", "91", "93", "94", "95", "96"];

fn paint(s: &str, code: Option<&str>, on: bool) -> String {
    match (on, code) {
        (true, Some(c)) => format!("\x1b[{c}m{s}\x1b[0m"),
        _ => s.to_string(),
    }
}

pub fn fmt_type(t: &Type) -> String {
    match t {
        Type::Scalar { name, constraint } => match constraint {
            None => name.clone(),
            Some(Constraint::Range { min, max }) => {
                format!("{name}({}..{})", min.map(|m| m.to_string()).unwrap_or_default(), max.map(|m| m.to_string()).unwrap_or_default())
            }
            Some(Constraint::Pattern { value }) => format!("{name}(pattern: {value:?})"),
        },
        Type::Ref { name, .. } => name.clone(),
        Type::Object { fields } => fmt_fields(fields),
        Type::Array { item } => match item.as_ref() {
            Type::Union { .. } => format!("({})[]", fmt_type(item)),
            _ => format!("{}[]", fmt_type(item)),
        },
        Type::Union { variants } => variants.iter().map(fmt_type).collect::<Vec<_>>().join(" | "),
        Type::Literal { value } => format!("{value:?}"),
        Type::Null => "null".to_string(),
    }
}

fn fmt_fields(fields: &[Field]) -> String {
    let inner: Vec<String> =
        fields.iter().map(|f| format!("{}{}: {}", f.name, if f.optional { "?" } else { "" }, fmt_type(&f.ty))).collect();
    format!("{{ {} }}", inner.join(", "))
}

/// Description of types etc. for `--all` (params / search / body / headers / response / wrap / cache / cookie)
fn details(e: &Endpoint) -> Vec<String> {
    let mut out = Vec::new();
    if !e.params.is_empty() {
        out.push(format!("params  {}", fmt_fields(&e.params)));
    }
    if !e.search.is_empty() {
        out.push(format!("search  {}", fmt_fields(&e.search)));
    }
    if let Some(b) = &e.body {
        out.push(format!("body    {}", fmt_type(b)));
    }
    if !e.request_headers.is_empty() {
        out.push(format!("headers {}", fmt_fields(&e.request_headers)));
    }
    let res: Vec<String> = e
        .responses
        .iter()
        .map(|r| match &r.body {
            Some(b) => format!("{} {}", r.status, fmt_type(b)),
            None => format!("{} none", r.status),
        })
        .collect();
    out.push(format!("→       {}", res.join(" | ")));
    let mut flags = Vec::new();
    if !e.wraps.is_empty() {
        flags.push(format!("wrap {}", e.wraps.join(" > ")));
    }
    if e.cookie {
        flags.push("cookie on".to_string());
    }
    match &e.cache {
        Some(CacheMode::Off) => flags.push("cache off".to_string()),
        Some(CacheMode::Memory { ttl_ms }) => flags.push(format!("cache {ttl_ms}")),
        Some(CacheMode::Cookie { ttl_ms }) => flags.push(format!("cache {ttl_ms} cookie")),
        None => {}
    }
    if !flags.is_empty() {
        out.push(format!("        {}", flags.join(" / ")));
    }
    out
}

fn group_label(wraps: &[String]) -> String {
    if wraps.is_empty() {
        "wrap なし".to_string()
    } else {
        format!("wrap: {}", wraps.join(" > "))
    }
}

/// Prints the endpoints of one service
pub fn render(ir_name: &str, endpoints: &[Endpoint], opts: &Options, multi: bool) -> String {
    let mut eps: Vec<&Endpoint> = endpoints.iter().collect();
    eps.sort_by(|a, b| a.path.cmp(&b.path).then(a.method.cmp(&b.method)));

    // Assign a number and a color to each wrap set (including order). No wrap comes first, with no color
    let mut keys: Vec<Vec<String>> = eps.iter().map(|e| e.wraps.clone()).collect();
    keys.sort();
    keys.dedup();
    let color_of: BTreeMap<Vec<String>, Option<&str>> = keys
        .iter()
        .enumerate()
        .map(|(i, k)| {
            (
                k.clone(),
                if k.is_empty() { None } else { Some(PALETTE[(i.saturating_sub(usize::from(keys[0].is_empty()))) % PALETTE.len()]) },
            )
        })
        .collect();

    // Color of an intermediate path segment: among the endpoints below that segment, the most common wrap set (the earlier one in order on a tie). The last segment uses the endpoint's own wrap
    let segs_of = |e: &Endpoint| -> Vec<String> { e.path.split('/').filter(|s| !s.is_empty()).map(String::from).collect() };
    let mut prefix_votes: BTreeMap<Vec<String>, Vec<(Vec<String>, usize)>> = BTreeMap::new();
    for e in &eps {
        let segs = segs_of(e);
        for i in 1..=segs.len() {
            let votes = prefix_votes.entry(segs[..i].to_vec()).or_default();
            match votes.iter_mut().find(|(k, _)| *k == e.wraps) {
                Some(v) => v.1 += 1,
                None => votes.push((e.wraps.clone(), 1)),
            }
        }
    }
    let seg_color = |prefix: &[String]| -> Option<&str> {
        let votes = prefix_votes.get(prefix)?;
        let best = votes.iter().fold(None::<&(Vec<String>, usize)>, |b, v| match b {
            Some(x) if x.1 >= v.1 => Some(x),
            _ => Some(v),
        })?;
        color_of.get(&best.0).copied().flatten()
    };

    let line = |e: &Endpoint| -> String {
        let segs = segs_of(e);
        let mut path = String::new();
        for i in 0..segs.len() {
            // The last segment uses the endpoint's own wrap. Intermediate segments use the majority of those below
            let c = if i + 1 == segs.len() { color_of.get(&e.wraps).copied().flatten() } else { seg_color(&segs[..=i]) };
            path.push_str(&paint(&format!("/{}", segs[i]), c, opts.color));
        }
        if segs.is_empty() {
            path.push('/');
        }
        let method = e.method.to_uppercase();
        if opts.all {
            format!("{method:<7} {path}")
        } else {
            format!("{method} {path}")
        }
    };

    let mut out = String::new();
    if multi {
        out.push_str(&format!("[{ir_name}]\n"));
    }
    let emit = |e: &Endpoint, out: &mut String| {
        out.push_str(&line(e));
        out.push('\n');
        if opts.all {
            for d in details(e) {
                out.push_str(&format!("          {d}\n"));
            }
        }
    };
    if opts.group {
        for k in &keys {
            let color = color_of.get(k).copied().flatten();
            out.push_str(&format!("{}\n", paint(&format!("── {} ──", group_label(k)), color, opts.color)));
            for e in eps.iter().filter(|e| &e.wraps == k) {
                emit(e, &mut out);
            }
            out.push('\n');
        }
    } else {
        for e in &eps {
            emit(e, &mut out);
        }
        if opts.color && keys.iter().any(|k| !k.is_empty()) {
            out.push('\n');
            for k in &keys {
                out.push_str(&format!("{} {}\n", paint("■", color_of.get(k).copied().flatten(), true), group_label(k)));
            }
        }
    }
    out
}

pub fn render_all(ir: &Ir, opts: &Options) -> String {
    let multi = ir.services.len() > 1;
    ir.services.iter().map(|(name, svc)| render(name, &svc.endpoints, opts, multi)).collect::<Vec<_>>().join("\n")
}

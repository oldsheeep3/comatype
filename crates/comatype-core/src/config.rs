use crate::diag::{Diagnostic, Span};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub services: BTreeMap<String, ServiceConfig>,
    /// Adds status codes not in the standard set: `[{ "status": 299, "message": "Custom" }]`
    #[serde(default)]
    pub additional_status_codes: Vec<AdditionalStatus>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AdditionalStatus {
    pub status: u16,
    pub message: String,
}

impl Config {
    /// Table of usable status codes (standard + `additionalStatusCodes`)
    pub fn status_table(&self) -> crate::status::StatusTable {
        let mut t = crate::status::builtin_table();
        for a in &self.additional_status_codes {
            t.entry(a.status).or_insert_with(|| a.message.clone());
        }
        t
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceConfig {
    pub comat_dir: String,
    #[serde(default)]
    pub targets: Vec<Target>,
}

#[derive(Debug, Deserialize)]
pub struct Target {
    pub lang: String,
    pub role: String,
    pub root: String,
    #[serde(default)]
    pub out: Option<String>,
    /// Go: import path of the output (out). If absent, derived from the module of the go.mod found by walking up from root
    #[serde(default, rename = "importPath")]
    pub import_path: Option<String>,
    /// Java / Kotlin: package name of the generated code. If absent, derived from the path after `src/main/java/` in out (else `comatype.gen`).
    /// C#: the namespace of the generated code (default `ComatypeGen`)
    #[serde(default)]
    pub package: Option<String>,
}

pub const LANGS: &[&str] = &["ts", "go", "python", "rust", "java", "ruby", "kotlin", "swift", "csharp", "dart"];

/// Reads `comatype.config.json`. `path` is the file or the directory containing it
pub fn load(path: &Path) -> Result<(Config, PathBuf), Vec<Diagnostic>> {
    let file = if path.is_dir() { path.join("comatype.config.json") } else { path.to_path_buf() };
    let name = file.display().to_string();
    let text = std::fs::read_to_string(&file).map_err(|e| vec![Diagnostic::error(&name, Span::default(), format!("cannot read: {e}"))])?;
    let cfg: Config =
        serde_json::from_str(&text).map_err(|e| vec![Diagnostic::error(&name, Span { line: e.line(), col: e.column() }, e.to_string())])?;
    let mut diags = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for (i, a) in cfg.additional_status_codes.iter().enumerate() {
        let at = format!("additionalStatusCodes[{i}]");
        if !(100..=599).contains(&a.status) {
            diags.push(Diagnostic::error(&name, Span::default(), format!("{at}: status {} must be between 100 and 599", a.status)));
        } else if crate::status::builtin_message(a.status).is_some() {
            diags.push(Diagnostic::error(
                &name,
                Span::default(),
                format!(
                    "{at}: status {} is already defined as a standard code ({})",
                    a.status,
                    crate::status::builtin_message(a.status).unwrap()
                ),
            ));
        } else if !seen.insert(a.status) {
            diags.push(Diagnostic::error(&name, Span::default(), format!("{at}: status {} is duplicated", a.status)));
        }
        if a.message.trim().is_empty() {
            diags.push(Diagnostic::error(&name, Span::default(), format!("{at}: message is empty")));
        }
    }
    for (sname, s) in &cfg.services {
        for (i, t) in s.targets.iter().enumerate() {
            if !LANGS.contains(&t.lang.as_str()) {
                diags.push(Diagnostic::error(
                    &name,
                    Span::default(),
                    format!("services.{sname}.targets[{i}]: unsupported lang `{}` ({})", t.lang, LANGS.join(", ")),
                ));
            }
            if t.role != "client" && t.role != "server" {
                diags.push(Diagnostic::error(
                    &name,
                    Span::default(),
                    format!("services.{sname}.targets[{i}]: role must be client or server (`{}`)", t.role),
                ));
            }
        }
    }
    if !diags.is_empty() {
        return Err(diags);
    }
    let base = file.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("."));
    Ok((cfg, base))
}

/// Default `out` per language (SPEC §2.1)
pub fn default_out(lang: &str) -> &'static str {
    match lang {
        "ts" | "go" => "comatype",
        "python" | "ruby" => "comatype_gen",
        "rust" => "src/comatype_gen",
        "java" => "src/main/java/comatype/gen",
        "kotlin" => "src/main/kotlin/comatype/gen",
        "swift" => "Sources/ComatypeGen",
        "csharp" => "ComatypeGen",
        "dart" => "lib/comatype_gen",
        _ => "comatype",
    }
}

/// Output location of a target (relative to the config directory).
/// If `out` is not given, the default plus the service / role difference among targets with the same root and language
pub fn resolve_out(cfg: &Config, service: &str, target: &Target) -> PathBuf {
    if let Some(out) = &target.out {
        return Path::new(&target.root).join(out);
    }
    let mut services = std::collections::BTreeSet::new();
    let mut roles = std::collections::BTreeSet::new();
    for (sname, s) in &cfg.services {
        for t in &s.targets {
            if t.root == target.root && t.lang == target.lang {
                services.insert(sname.as_str());
                if sname == service {
                    roles.insert(t.role.as_str());
                }
            }
        }
    }
    let mut p = Path::new(&target.root).join(default_out(&target.lang));
    if services.len() > 1 {
        p = p.join(service);
    }
    if roles.len() > 1 {
        p = p.join(&target.role);
    }
    p
}

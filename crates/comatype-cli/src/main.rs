mod endpoints;
mod format;
mod report;

use comatype_core::config;
use comatype_core::diag::Severity;
use comatype_core::project;
use std::path::PathBuf;
use std::process::ExitCode;

const USAGE: &str = "\
Usage: comatype <command> [options]

Commands:
  check [topic]    check the .comat files (exit code 1 on errors). Topics: cache / path / wrap / cookie / status / import / type / all
  format [dir]     rewrite directory and file names to the recommended layout (only proposes by default; --fix applies, -y applies without asking; exit code 1 if anything needs fixing)
  endpoints        list the endpoints as `GET /path` (paths are colored per wrap; -a: also types etc., -g: group by wrap)
  ir               check and print the IR (JSON)
  generate         generate code for the targets in the config (ts / go / python / ...)
  to-openapi       make OpenAPI 3 (YAML) from the .comat files (-o sets the output; default is stdout)
  from-openapi <file>  make .comat files and comatype.config.json from OpenAPI 3 (YAML / JSON)
                   (--out DIR, repeat --target lang:role:root, --generate also generates code, --force overwrites)
  statuses         list the usable status codes (--snippets: VS Code snippets, --json: JSON)
  lsp              run the language server (LSP) over stdin/stdout (for editors)
  parse <file>     parse one file and print the AST (JSON)

Options:
  --config <path>  comatype.config.json (or its directory). Default: ./comatype.config.json
  --service <name> the service to use. Default: all
  -o <file>        output file of ir. Default: stdout
  --lang <lang>    restrict generate to one language
  --role <role>    restrict generate to client / server
  --snippets       print statuses as snippets (JSON)
  --json           print statuses as JSON
  --dry-run        with generate, only show the output paths without writing
  --fix, -y        with format: apply / apply without asking
  -a, --all        with endpoints: also print types, wrap, cache and so on besides the methods
  -g, --group      with endpoints: separate by wrap (exact match including order)
  --color / --no-color  colors of endpoints (default: colors only on a terminal)
";

struct Args {
    cmd: String,
    positional: Vec<String>,
    config: PathBuf,
    service: Option<String>,
    out: Option<PathBuf>,
    lang: Option<String>,
    role: Option<String>,
    dry_run: bool,
    snippets: bool,
    json: bool,
    targets: Vec<String>,
    force: bool,
    generate: bool,
    all: bool,
    group: bool,
    fix: bool,
    yes: bool,
    color: Option<bool>,
}

fn parse_args() -> Result<Args, String> {
    let mut it = std::env::args().skip(1);
    let cmd = it.next().ok_or("missing command")?;
    let mut a = Args {
        cmd,
        positional: vec![],
        config: PathBuf::from("comatype.config.json"),
        service: None,
        out: None,
        lang: None,
        role: None,
        dry_run: false,
        snippets: false,
        json: false,
        targets: vec![],
        force: false,
        generate: false,
        all: false,
        group: false,
        fix: false,
        yes: false,
        color: None,
    };
    while let Some(x) = it.next() {
        match x.as_str() {
            "--config" => a.config = it.next().ok_or("--config needs a value")?.into(),
            "--service" => a.service = Some(it.next().ok_or("--service needs a value")?),
            "--lang" => a.lang = Some(it.next().ok_or("--lang needs a value")?),
            "--role" => a.role = Some(it.next().ok_or("--role needs a value")?),
            "--dry-run" => a.dry_run = true,
            "--snippets" => a.snippets = true,
            "--out" => a.out = Some(it.next().ok_or("--out needs a value")?.into()),
            "--target" => a.targets.push(it.next().ok_or("--target needs a value")?),
            "--force" => a.force = true,
            "--generate" => a.generate = true,
            "--json" => a.json = true,
            "--all" | "-a" => a.all = true,
            "--fix" => a.fix = true,
            "-y" | "--yes" => a.yes = true,
            "--group" | "-g" => a.group = true,
            "--color" => a.color = Some(true),
            "--no-color" => a.color = Some(false),
            "-o" => a.out = Some(it.next().ok_or("-o needs a value")?.into()),
            s if s.starts_with('-') => return Err(format!("unknown option {s}")),
            _ => a.positional.push(x),
        }
    }
    Ok(a)
}

pub fn main() -> ExitCode {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}\n\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    report::init(args.color);
    match args.cmd.as_str() {
        "format" => {
            // dirpath is a directory containing `.comat` files (comatDir), or a directory containing comatype.config.json (all comatDirs of its services). If omitted, the config's comatDir
            let mut dirs: Vec<PathBuf> = Vec::new();
            let targets: Vec<PathBuf> =
                if args.positional.is_empty() { vec![args.config.clone()] } else { args.positional.iter().map(PathBuf::from).collect() };
            for t in targets {
                let cfg = if t.is_dir() { t.join("comatype.config.json") } else { t.clone() };
                if cfg.is_file() {
                    match config::load(&cfg) {
                        Ok((c, base)) => {
                            dirs.extend(c.services.values().map(|s| base.join(&s.comat_dir).components().collect::<PathBuf>()))
                        }
                        Err(d) => {
                            d.iter().for_each(report::print);
                            return ExitCode::from(1);
                        }
                    }
                } else {
                    dirs.push(t);
                }
            }
            ExitCode::from(format::run(&dirs, &format::Options { fix: args.fix, yes: args.yes }, &report::info) as u8)
        }
        "endpoints" => {
            let res = project::check_config(&args.config, args.service.as_deref());
            let errors = res.diagnostics.iter().filter(|d| d.severity == Severity::Error).count();
            for d in res.diagnostics.iter().filter(|d| d.severity == Severity::Error) {
                report::print(d);
            }
            let Some(ir) = res.ir else {
                eprintln!("cannot list the endpoints because there are {errors} error(s) (run `comatype check`)");
                return ExitCode::from(1);
            };
            use std::io::IsTerminal;
            let color = args.color.unwrap_or_else(|| std::io::stdout().is_terminal() && std::env::var_os("NO_COLOR").is_none());
            print!("{}", endpoints::render_all(&ir, &endpoints::Options { all: args.all, group: args.group, color }));
            ExitCode::SUCCESS
        }
        "check" if !args.positional.is_empty() => check_topic(&args),
        "check" | "ir" => {
            let res = project::check_config(&args.config, args.service.as_deref());
            for d in &res.diagnostics {
                report::print(d);
            }
            let errors = res.diagnostics.iter().filter(|d| d.severity == Severity::Error).count();
            let warnings = res.diagnostics.len() - errors;
            let Some(ir) = res.ir else {
                report::error(&format!("{errors} error(s), {warnings} warning(s)"));
                return ExitCode::from(1);
            };
            if args.cmd == "check" {
                let eps: usize = ir.services.values().map(|s| s.endpoints.len()).sum();
                report::info(&format!("OK: {eps} endpoint(s), {warnings} warning(s)"));
            } else {
                let json = serde_json::to_string_pretty(&ir).unwrap();
                match &args.out {
                    Some(p) => {
                        if let Err(e) = std::fs::write(p, json + "\n") {
                            eprintln!("cannot write: {e}");
                            return ExitCode::from(1);
                        }
                    }
                    None => println!("{json}"),
                }
            }
            ExitCode::SUCCESS
        }
        "generate" => generate(&args),
        "statuses" => statuses(&args),
        "to-openapi" => to_openapi(&args),
        "from-openapi" => from_openapi(&args),
        "lsp" => {
            // Language server (stdin / stdout). Started by the editor
            let stdin = std::io::stdin();
            let stdout = std::io::stdout();
            match comatype_lsp::run(&mut stdin.lock(), &mut stdout.lock()) {
                Ok(code) => ExitCode::from(code as u8),
                Err(e) => {
                    eprintln!("lsp: {e}");
                    ExitCode::from(1)
                }
            }
        }
        "parse" => {
            let Some(file) = args.positional.first() else {
                eprintln!("specify a file\n\n{USAGE}");
                return ExitCode::from(2);
            };
            match project::parse_only(file.as_ref()) {
                Ok(ast) => {
                    println!("{}", serde_json::to_string_pretty(&ast).unwrap());
                    ExitCode::SUCCESS
                }
                Err(d) => {
                    report::print(&d);
                    ExitCode::from(1)
                }
            }
        }
        "help" | "--help" | "-h" => {
            print!("{USAGE}");
            ExitCode::SUCCESS
        }
        other => {
            eprintln!("unknown command {other}\n\n{USAGE}");
            ExitCode::from(2)
        }
    }
}

/// Topics that `comatype check <topic>` can filter by
const TOPICS: &[(&str, &str)] = &[
    ("cache", "cache settings (get / query only, ignored in defaults / init, combination with wrap)"),
    ("path", "path derivation, duplicates, dynamic segments"),
    ("wrap", "wrap and wrapper declarations (missing declarations, unused wrappers)"),
    ("cookie", "cookie and the cookie declaration in init.comat"),
    ("status", "status codes and body types"),
    ("import", "import (unused, unresolved)"),
    ("type", "types, constraints, headers (anything not above)"),
];

/// Which topic a diagnostic belongs to (decided from the message)
fn topic_of(msg: &str) -> &'static str {
    let m = msg.to_lowercase();
    if m.contains("cache") {
        "cache"
    } else if m.contains("wrap") {
        "wrap"
    } else if m.contains("cookie") {
        "cookie"
    } else if m.contains("path") || m.contains("duplicate") || m.contains("module name") {
        "path"
    } else if m.contains(" s2") || m.contains(" s4") || m.contains(" s5") || m.contains("status") {
        "status"
    } else if m.contains("import") {
        "import"
    } else {
        "type"
    }
}

/// `comatype check <topic>`: checks everything and shows only that topic's diagnostics (`all` for everything)
fn check_topic(args: &Args) -> ExitCode {
    let topic = args.positional[0].as_str();
    if topic != "all" && !TOPICS.iter().any(|(t, _)| *t == topic) {
        eprintln!("unknown topic `{topic}`. Available topics:");
        for (t, d) in TOPICS {
            eprintln!("  {t:<7} {d}");
        }
        eprintln!("  all     everything");
        return ExitCode::from(2);
    }
    let res = project::check_config(&args.config, args.service.as_deref());
    let picked: Vec<_> = res.diagnostics.iter().filter(|d| topic == "all" || topic_of(&d.message) == topic).collect();
    for d in &picked {
        report::print(d);
    }
    let errors = picked.iter().filter(|d| d.severity == Severity::Error).count();
    // If there is an error outside the chosen topic and the IR cannot be built, the check has not been done
    let other_errors = res.diagnostics.iter().filter(|d| d.severity == Severity::Error).count() - errors;
    if other_errors > 0 {
        report::info(&format!("there are {other_errors} error(s) outside {topic}; run `comatype check` to see all of them"));
    }
    if errors > 0 {
        report::error(&format!("{topic}: {errors} error(s), {} warning(s)", picked.len() - errors));
    } else {
        report::info(&format!("{topic}: 0 error(s), {} warning(s)", picked.len()));
    }
    if errors > 0 || (res.ir.is_none() && other_errors > 0) {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

fn generate(args: &Args) -> ExitCode {
    let res = project::check_config(&args.config, args.service.as_deref());
    for d in &res.diagnostics {
        report::print(d);
    }
    let Some(ir) = res.ir else {
        report::error("not generating because there are errors");
        return ExitCode::from(1);
    };
    let (cfg, base) = match config::load(&args.config) {
        Ok(v) => v,
        Err(d) => {
            d.iter().for_each(report::print);
            return ExitCode::from(1);
        }
    };
    let mut written = 0;
    for (name, svc) in &ir.services {
        for target in &cfg.services[name].targets {
            if args.lang.as_deref().is_some_and(|l| l != target.lang) || args.role.as_deref().is_some_and(|r| r != target.role) {
                continue;
            }
            let out = base.join(config::resolve_out(&cfg, name, target));
            let files = match target.lang.as_str() {
                "ts" => comatype_gen_ts::generate(svc).map(|v| v.into_iter().map(|f| (f.path, f.content)).collect::<Vec<_>>()),
                "js" => comatype_gen_ts::generate_js(svc).map(|v| v.into_iter().map(|f| (f.path, f.content)).collect::<Vec<_>>()),
                "go" => {
                    let role = if target.role == "client" { comatype_gen_go::Role::Client } else { comatype_gen_go::Role::Server };
                    match go_import_path(target, &out) {
                        Ok(ip) => comatype_gen_go::generate(svc, role, &ip)
                            .map(|v| v.into_iter().map(|f| (f.path, f.content)).collect::<Vec<_>>()),
                        Err(e) => Err(e),
                    }
                }
                "python" => {
                    let role = if target.role == "client" { comatype_gen_python::Role::Client } else { comatype_gen_python::Role::Server };
                    comatype_gen_python::generate(svc, role).map(|v| v.into_iter().map(|f| (f.path, f.content)).collect::<Vec<_>>())
                }
                "java" => {
                    let role = if target.role == "client" { comatype_gen_java::Role::Client } else { comatype_gen_java::Role::Server };
                    comatype_gen_java::generate(svc, role, &jvm_package(target, &out))
                        .map(|v| v.into_iter().map(|f| (f.path, f.content)).collect::<Vec<_>>())
                }
                "kotlin" => {
                    let role = if target.role == "client" { comatype_gen_kotlin::Role::Client } else { comatype_gen_kotlin::Role::Server };
                    comatype_gen_kotlin::generate(svc, role, &jvm_package(target, &out))
                        .map(|v| v.into_iter().map(|f| (f.path, f.content)).collect::<Vec<_>>())
                }
                "csharp" => {
                    let role = if target.role == "client" { comatype_gen_csharp::Role::Client } else { comatype_gen_csharp::Role::Server };
                    let ns = target.package.clone().unwrap_or_else(|| "ComatypeGen".to_string());
                    comatype_gen_csharp::generate(svc, role, &ns).map(|v| v.into_iter().map(|f| (f.path, f.content)).collect::<Vec<_>>())
                }
                "swift" => {
                    let role = if target.role == "client" { comatype_gen_swift::Role::Client } else { comatype_gen_swift::Role::Server };
                    comatype_gen_swift::generate(svc, role).map(|v| v.into_iter().map(|f| (f.path, f.content)).collect::<Vec<_>>())
                }
                "ruby" => {
                    let role = if target.role == "client" { comatype_gen_ruby::Role::Client } else { comatype_gen_ruby::Role::Server };
                    comatype_gen_ruby::generate(svc, role).map(|v| v.into_iter().map(|f| (f.path, f.content)).collect::<Vec<_>>())
                }
                "rust" => {
                    let role = if target.role == "client" { comatype_gen_rust::Role::Client } else { comatype_gen_rust::Role::Server };
                    comatype_gen_rust::generate(svc, role).map(|v| v.into_iter().map(|f| (f.path, f.content)).collect::<Vec<_>>())
                }
                other => {
                    eprintln!("skip: {name} {other} {}(unsupported language)", target.role);
                    continue;
                }
            };
            let files = match files {
                Ok(f) => f,
                Err(e) => {
                    eprintln!("error: {name} {} {}: {e}", target.lang, target.role);
                    return ExitCode::from(1);
                }
            };
            for (rel, content) in files {
                let path = out.join(&rel);
                if args.dry_run {
                    println!("{}", path.display());
                    continue;
                }
                if let Some(dir) = path.parent() {
                    if let Err(e) = std::fs::create_dir_all(dir) {
                        eprintln!("error: {}: {e}", dir.display());
                        return ExitCode::from(1);
                    }
                }
                if let Err(e) = std::fs::write(&path, content) {
                    eprintln!("error: {}: {e}", path.display());
                    return ExitCode::from(1);
                }
                written += 1;
            }
            if target.lang == "rust" && !args.dry_run {
                // Format with rustfmt if available (otherwise leave as is)
                if let Ok(rd) = std::fs::read_dir(&out) {
                    for e in rd.flatten().filter(|e| e.path().extension().is_some_and(|x| x == "rs")) {
                        let _ = std::process::Command::new("rustfmt").args(["--edition", "2021"]).arg(e.path()).status();
                    }
                }
            }
            if target.lang == "go" && !args.dry_run {
                // Format with gofmt if available (otherwise leave as is)
                let _ = std::process::Command::new("gofmt").arg("-w").arg(&out).status();
            }
        }
    }
    if !args.dry_run {
        eprintln!("generated: {written} file(s)");
    }
    ExitCode::SUCCESS
}

/// Package name of the Java / Kotlin output. The target's package, otherwise the path after `src/main/<lang>/` in out
fn jvm_package(target: &config::Target, out: &std::path::Path) -> String {
    if let Some(p) = &target.package {
        return p.clone();
    }
    let comps: Vec<String> = out.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect();
    for (i, w) in comps.windows(3).enumerate() {
        if w[0] == "src" && w[1] == "main" && (w[2] == "java" || w[2] == "kotlin") {
            let rest = &comps[i + 3..];
            if !rest.is_empty() {
                return rest.join(".");
            }
        }
    }
    "comatype.gen".to_string()
}

/// Import path of the Go output. The target's importPath, otherwise the module of the go.mod found by walking up + the path relative to go.mod
fn go_import_path(target: &config::Target, out: &std::path::Path) -> Result<String, String> {
    if let Some(p) = &target.import_path {
        return Ok(p.trim_end_matches('/').to_string());
    }
    // out may not exist yet, so walk up to the part that exists
    let mut dir = out.to_path_buf();
    while !dir.exists() {
        if !dir.pop() {
            break;
        }
    }
    let mut cur = Some(dir.as_path());
    while let Some(d) = cur {
        let gomod = d.join("go.mod");
        if let Ok(text) = std::fs::read_to_string(&gomod) {
            let module = text
                .lines()
                .find_map(|l| l.trim().strip_prefix("module ").map(|m| m.trim().trim_matches('"').to_string()))
                .ok_or_else(|| format!("{} has no module line", gomod.display()))?;
            let rel = out.strip_prefix(d).map_err(|e| e.to_string())?;
            let rel = rel.to_string_lossy().replace('\\', "/");
            return Ok(if rel.is_empty() { module } else { format!("{module}/{rel}") });
        }
        cur = d.parent();
    }
    Err(format!(
        "cannot decide the import path of {} (there is no go.mod above root; write \"importPath\": \"example.com/app/comatype\" in the target of comatype.config.json)",
        out.display()
    ))
}

/// Usable status codes. Includes additionalStatusCodes if --config is given
fn statuses(args: &Args) -> ExitCode {
    use comatype_core::status;
    let mut table = status::builtin_table();
    let mut custom = std::collections::BTreeSet::new();
    if args.config.exists() {
        match config::load(&args.config) {
            Ok((cfg, _)) => {
                for a in &cfg.additional_status_codes {
                    if table.insert(a.status, a.message.clone()).is_none() {
                        custom.insert(a.status);
                    }
                }
            }
            Err(d) => d.iter().for_each(report::print),
        }
    }
    if args.snippets {
        // Standard codes only (what differs per config is not put in the snippets; completion comes from the language server)
        let mut map = serde_json::Map::new();
        for (code, msg) in status::BUILTIN {
            let body: Vec<String> = if status::no_body(*code) {
                vec![format!("s{code} none")]
            } else {
                vec![format!("s{code} {{"), "\tmessage: string,".to_string(), "}".to_string()]
            };
            map.insert(
                format!("s{code}"),
                serde_json::json!({
                    "prefix": format!("s{code}"),
                    "body": body,
                    "description": format!("{code} {msg}"),
                }),
            );
        }
        println!("{}", serde_json::to_string_pretty(&serde_json::Value::Object(map)).unwrap());
    } else if args.json {
        let list: Vec<_> = table
            .iter()
            .map(|(c, m)| serde_json::json!({"status": c, "message": m, "body": !status::no_body(*c), "custom": custom.contains(c)}))
            .collect();
        println!("{}", serde_json::to_string_pretty(&list).unwrap());
    } else {
        for (c, m) in &table {
            println!(
                "s{c}  {m}{}{}",
                if status::no_body(*c) { "  (no body)" } else { "" },
                if custom.contains(c) { "  (added)" } else { "" }
            );
        }
    }
    ExitCode::SUCCESS
}

/// .comat → OpenAPI. If there are several services, choose with --service (standard output if there is no -o)
fn to_openapi(args: &Args) -> ExitCode {
    let res = project::check_config(&args.config, args.service.as_deref());
    for d in &res.diagnostics {
        report::print(d);
    }
    let Some(ir) = res.ir else {
        eprintln!("not writing the output because there are errors");
        return ExitCode::from(1);
    };
    let (cfg, _) = match config::load(&args.config) {
        Ok(v) => v,
        Err(d) => {
            d.iter().for_each(report::print);
            return ExitCode::from(1);
        }
    };
    if ir.services.len() != 1 {
        eprintln!(
            "there are {} services (choose one with --service: {})",
            ir.services.len(),
            ir.services.keys().cloned().collect::<Vec<_>>().join(", ")
        );
        return ExitCode::from(2);
    }
    let (name, svc) = ir.services.iter().next().unwrap();
    let doc = comatype_openapi::export(name, svc, &cfg.status_table());
    let text = if args.out.as_ref().is_some_and(|p| p.extension().is_some_and(|e| e == "json")) {
        serde_json::to_string_pretty(&doc).unwrap() + "\n"
    } else {
        comatype_openapi::to_yaml(&doc)
    };
    match &args.out {
        Some(p) => {
            if let Err(e) = std::fs::write(p, text) {
                eprintln!("cannot write: {e}");
                return ExitCode::from(1);
            }
            eprintln!("wrote OpenAPI: {}", p.display());
        }
        None => print!("{text}"),
    }
    ExitCode::SUCCESS
}

/// OpenAPI → .comat (and the config file). With --generate, also generates code right away
fn from_openapi(args: &Args) -> ExitCode {
    let Some(file) = args.positional.first() else {
        eprintln!("specify an OpenAPI file\n\n{USAGE}");
        return ExitCode::from(2);
    };
    let text = match std::fs::read_to_string(file) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("cannot read: {file}: {e}");
            return ExitCode::from(1);
        }
    };
    let doc = match comatype_openapi::parse_document(&text) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("{file}: {e}");
            return ExitCode::from(1);
        }
    };
    let imported = match comatype_openapi::import(&doc, &comatype_core::status::builtin_table()) {
        Ok(i) => i,
        Err(e) => {
            eprintln!("{file}: {e}");
            return ExitCode::from(1);
        }
    };
    let out_dir = args.out.clone().unwrap_or_else(|| PathBuf::from("."));
    let config_path = out_dir.join("comatype.config.json");
    if !args.force && (out_dir.join("comatfiles").exists() || config_path.exists()) {
        eprintln!("{} already has comatfiles or comatype.config.json (--force overwrites)", out_dir.display());
        return ExitCode::from(1);
    }
    let mut targets = Vec::new();
    for t in &args.targets {
        let parts: Vec<&str> = t.splitn(3, ':').collect();
        if parts.len() != 3 || !["client", "server"].contains(&parts[1]) {
            eprintln!("--target must be written as lang:role:root (for example ts:client:./client): {t}");
            return ExitCode::from(2);
        }
        targets.push(serde_json::json!({"lang": parts[0], "role": parts[1], "root": parts[2]}));
    }
    let mut cfg = serde_json::json!({"services": {"api": {"comatDir": "./comatfiles", "targets": targets}}});
    if !imported.additional_status_codes.is_empty() {
        cfg["additionalStatusCodes"] = serde_json::Value::Array(
            imported.additional_status_codes.iter().map(|(c, m)| serde_json::json!({"status": c, "message": m})).collect(),
        );
    }
    for (rel, content) in &imported.files {
        let path = out_dir.join(rel);
        if let Some(dir) = path.parent() {
            if let Err(e) = std::fs::create_dir_all(dir) {
                eprintln!("cannot create: {}: {e}", dir.display());
                return ExitCode::from(1);
            }
        }
        if let Err(e) = std::fs::write(&path, content) {
            eprintln!("cannot write: {}: {e}", path.display());
            return ExitCode::from(1);
        }
    }
    if let Err(e) = std::fs::write(&config_path, serde_json::to_string_pretty(&cfg).unwrap() + "\n") {
        eprintln!("cannot write: {}: {e}", config_path.display());
        return ExitCode::from(1);
    }
    for w in &imported.warnings {
        eprintln!("warning: {w}");
    }
    eprintln!(
        "wrote {} file(s) and {} ({} additional status code(s))",
        imported.files.len(),
        config_path.display(),
        imported.additional_status_codes.len()
    );

    // Whether what was written passes the check
    let res = project::check_config(&config_path, None);
    for d in &res.diagnostics {
        report::print(d);
    }
    if res.ir.is_none() {
        eprintln!("the generated .comat files have errors (see the diagnostics above)");
        return ExitCode::from(1);
    }
    if args.generate {
        if args.targets.is_empty() {
            eprintln!("--generate needs --target lang:role:root (for example --target ts:client:./client)");
            return ExitCode::from(2);
        }
        let gen_args = Args {
            cmd: "generate".into(),
            positional: vec![],
            config: config_path,
            service: None,
            out: None,
            lang: None,
            role: None,
            dry_run: false,
            snippets: false,
            json: false,
            targets: vec![],
            force: false,
            generate: false,
            all: false,
            group: false,
            fix: false,
            yes: false,
            color: None,
        };
        return generate(&gen_args);
    }
    ExitCode::SUCCESS
}

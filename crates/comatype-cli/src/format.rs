//! `comatype format <dir>`: rewrites directory and file names into the recommended style.
//!
//! - File name `get_[id].comat` (deprecated) → `[id]/get.comat`
//! - Removed styles `get__id.comat` / `get_:id.comat` → `[id]/get.comat`, and directory names `:id/` / `__id/` → `[id]/`
//!
//! By default it only shows what would change (suggest). `--fix` fixes them one at a time with confirmation. `--fix -y` applies everything as is.
//! Moving a file changes the relative `import` paths in other `.comat` files too, so those are rewritten together.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{BufRead, IsTerminal, Write};
use std::path::{Component, Path, PathBuf};

const METHODS: &[&str] = &["get", "post", "put", "patch", "delete", "options", "query", "head"];

#[derive(Debug, Clone)]
pub struct Move {
    pub from: PathBuf,
    pub to: PathBuf,
    pub reason: String,
}

#[derive(Debug, Default)]
pub struct Plan {
    pub moves: Vec<Move>,
    /// Things that could not be fixed (with the reason)
    pub skipped: Vec<(PathBuf, String)>,
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = rd.flatten().map(|e| e.path()).collect();
    entries.sort();
    for p in entries {
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        if p.is_dir() {
            walk(&p, out);
        } else if p.extension().is_some_and(|e| e == "comat") {
            out.push(p);
        }
    }
}

/// `:id` / `__id` → `id` (a dynamic name. For `[id]` it does not return `id` as is)
fn old_dynamic(name: &str) -> Option<&str> {
    name.strip_prefix(':').or_else(|| name.strip_prefix("__")).filter(|n| !n.is_empty())
}

fn bracket(name: &str) -> Option<&str> {
    name.strip_prefix('[').and_then(|x| x.strip_suffix(']')).filter(|n| !n.is_empty())
}

/// New relative path of one file (None if nothing changes) and the reason
fn rewrite(rel: &Path) -> Option<(PathBuf, String)> {
    let comps: Vec<String> =
        rel.components().filter_map(|c| if let Component::Normal(s) = c { s.to_str().map(String::from) } else { None }).collect();
    let (file, dirs) = comps.split_last()?;
    let mut reasons = Vec::new();
    let mut out: Vec<String> = Vec::new();
    for d in dirs {
        match old_dynamic(d) {
            Some(n) => {
                out.push(format!("[{n}]"));
                reasons.push(format!("ディレクトリ名 `{d}` は廃止（→ `[{n}]`）"));
            }
            None => out.push(d.clone()),
        }
    }
    let stem = file.strip_suffix(".comat")?;
    let mut new_file = file.clone();
    if stem != "init" && stem != "defaults" {
        if let Some((m, seg)) = stem.split_once('_') {
            if METHODS.contains(&m) {
                let (name, why) = if let Some(n) = bracket(seg) {
                    (Some(n.to_string()), format!("ファイル名 `{file}` の `[{n}]` は非推奨（→ `[{n}]/{m}.comat`）"))
                } else if let Some(n) = old_dynamic(seg).or_else(|| seg.strip_prefix('_')) {
                    (Some(n.to_string()), format!("ファイル名 `{file}` の `{seg}` は廃止（→ `[{n}]/{m}.comat`）"))
                } else {
                    (None, String::new())
                };
                if let Some(n) = name {
                    out.push(format!("[{n}]"));
                    new_file = format!("{m}.comat");
                    reasons.push(why);
                }
            }
        }
    }
    if reasons.is_empty() {
        return None;
    }
    out.push(new_file);
    Some((out.iter().collect(), reasons.join("、")))
}

fn has_relative_path_directive(text: &str) -> bool {
    text.lines().any(|l| {
        let t = l.trim_start();
        t.strip_prefix("path").is_some_and(|r| {
            r.starts_with(char::is_whitespace) && {
                let v = r.trim().trim_matches(|c| c == '\'' || c == '"');
                v == "." || v.starts_with("./")
            }
        })
    })
}

pub fn plan(root: &Path) -> Plan {
    let mut files = Vec::new();
    walk(root, &mut files);
    let existing: BTreeSet<PathBuf> = files.iter().map(|f| lexical(f)).collect();
    let mut plan = Plan::default();
    let mut targets: BTreeMap<PathBuf, PathBuf> = BTreeMap::new();
    for f in &files {
        let Ok(rel) = f.strip_prefix(root) else { continue };
        let Some((new_rel, reason)) = rewrite(rel) else { continue };
        let to = root.join(&new_rel);
        let text = std::fs::read_to_string(f).unwrap_or_default();
        let new_level = to.parent().map_or(0, |p| p.components().count()) != f.parent().map_or(0, |p| p.components().count());
        if new_level && has_relative_path_directive(&text) {
            plan.skipped.push((f.clone(), "`path ./...`（そのファイルのディレクトリからの相対）があるので、ディレクトリを足すと path が変わります。`path` を直してから、手で動かしてください".into()));
            continue;
        }
        if existing.contains(&lexical(&to)) || to.exists() {
            plan.skipped.push((f.clone(), format!("移動先 {} がすでにあります", new_rel.display())));
            continue;
        }
        if new_level && to.parent().is_some_and(|d| d.join("defaults.comat").exists()) {
            plan.skipped.push((
                f.clone(),
                format!(
                    "移動先のディレクトリ {} に defaults.comat があり、効く設定が変わります。手で確かめてください",
                    to.parent().unwrap().strip_prefix(root).unwrap_or(Path::new("")).display()
                ),
            ));
            continue;
        }
        if let Some(prev) = targets.insert(lexical(&to), f.clone()) {
            plan.skipped.push((f.clone(), format!("{} と同じ場所に動かすことになります", prev.display())));
            continue;
        }
        plan.moves.push(Move { from: f.clone(), to, reason });
    }
    plan
}

/// Collapses `.` and `..` textually (works even if the file does not exist)
fn lexical(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            c => out.push(c.as_os_str()),
        }
    }
    out
}

/// Relative path from `from_dir` to `to` (starts with `./` or `../`)
fn relative(from_dir: &Path, to: &Path) -> String {
    let a: Vec<_> = lexical(from_dir).components().map(|c| c.as_os_str().to_owned()).collect();
    let b: Vec<_> = lexical(to).components().map(|c| c.as_os_str().to_owned()).collect();
    let common = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let mut parts: Vec<String> = vec!["..".into(); a.len() - common];
    parts.extend(b[common..].iter().map(|s| s.to_string_lossy().to_string()));
    let joined = parts.join("/");
    if joined.starts_with("..") {
        joined
    } else {
        format!("./{joined}")
    }
}

/// Rewrites relative `import` paths after the move. `moves`: old → new (textually collapsed paths). Returns the files that were rewritten
fn fix_imports(root: &Path, moves: &BTreeMap<PathBuf, PathBuf>) -> Vec<PathBuf> {
    let mut files = Vec::new();
    walk(root, &mut files);
    // `import` can also point to types outside comatDir (`../types/...`), so look at siblings one level above root too
    if let Some(parent) = root.parent() {
        let mut more = Vec::new();
        walk(parent, &mut more);
        files = more.into_iter().filter(|p| !p.starts_with(root)).chain(files).collect();
    }
    let reverse: BTreeMap<PathBuf, PathBuf> = moves.iter().map(|(o, n)| (n.clone(), o.clone())).collect();
    let mut changed = Vec::new();
    for f in files {
        let nf = lexical(&f);
        let of = reverse.get(&nf).cloned().unwrap_or_else(|| nf.clone());
        let Ok(text) = std::fs::read_to_string(&f) else { continue };
        let mut out = String::new();
        let mut dirty = false;
        for line in text.split_inclusive('\n') {
            let t = line.trim_start();
            let rewritten = (|| {
                let rest = t.strip_prefix("import")?;
                if !rest.starts_with(char::is_whitespace) {
                    return None;
                }
                let idx = rest.find(" from ")?;
                let (head, tail) = rest.split_at(idx + 6);
                let path_str = tail.trim();
                if !(path_str.starts_with("./") || path_str.starts_with("../")) {
                    return None;
                }
                let old_target = lexical(&of.parent()?.join(path_str));
                let new_target = moves.get(&old_target).cloned().unwrap_or(old_target);
                let new_rel = relative(nf.parent()?, &new_target);
                if new_rel == path_str {
                    return None;
                }
                let indent = &line[..line.len() - t.len()];
                let nl = if line.ends_with('\n') { "\n" } else { "" };
                Some(format!("{indent}import{head}{new_rel}{nl}"))
            })();
            match rewritten {
                Some(l) => {
                    dirty = true;
                    out.push_str(&l);
                }
                None => out.push_str(line),
            }
        }
        if dirty && std::fs::write(&f, out).is_ok() {
            changed.push(f);
        }
    }
    changed
}

/// Performs the moves. Also rewrites `import`s and tidies up directories that became empty
pub fn apply(root: &Path, moves: &[Move]) -> Result<Vec<PathBuf>, String> {
    let map: BTreeMap<PathBuf, PathBuf> = moves.iter().map(|m| (lexical(&m.from), lexical(&m.to))).collect();
    for m in moves {
        if let Some(d) = m.to.parent() {
            std::fs::create_dir_all(d).map_err(|e| format!("{}: {e}", d.display()))?;
        }
        std::fs::rename(&m.from, &m.to).map_err(|e| format!("{} → {}: {e}", m.from.display(), m.to.display()))?;
    }
    let changed = fix_imports(root, &map);
    // Tidies up original directories that became empty (leaves them if they have content)
    for m in moves {
        let mut d = m.from.parent().map(Path::to_path_buf);
        while let Some(dir) = d {
            if dir == root || std::fs::remove_dir(&dir).is_err() {
                break;
            }
            d = dir.parent().map(Path::to_path_buf);
        }
    }
    Ok(changed)
}

fn show(root: &Path, p: &Path) -> String {
    p.strip_prefix(root).unwrap_or(p).display().to_string()
}

pub struct Options {
    pub fix: bool,
    pub yes: bool,
}

/// Returns the exit code: 0 = nothing to fix / fixed, 1 = suggest found something to fix (for CI), 2 = usage error
pub fn run(dirs: &[PathBuf], opts: &Options, report_info: &dyn Fn(&str)) -> i32 {
    let mut pending = 0;
    for root in dirs {
        if !root.is_dir() {
            eprintln!("ディレクトリがありません: {}", root.display());
            return 2;
        }
        let plan = plan(root);
        for (p, why) in &plan.skipped {
            report_info(&format!("スキップ {}: {why}", show(root, p)));
        }
        if plan.moves.is_empty() {
            report_info(&format!("{}: 直すものはありません", root.display()));
            continue;
        }
        for m in &plan.moves {
            println!("{}  →  {}", show(root, &m.from), show(root, &m.to));
            println!("    {}", m.reason);
        }
        if !opts.fix {
            pending += plan.moves.len();
            report_info(&format!(
                "{}: 直せるものが {} 件あります。`comatype format {} --fix` で直せます（`-y` で、確かめずに全部）",
                root.display(),
                plan.moves.len(),
                root.display()
            ));
            continue;
        }
        let mut accepted: Vec<Move> = Vec::new();
        let mut all = opts.yes;
        let stdin = std::io::stdin();
        if !all && !stdin.is_terminal() {
            eprintln!("対話できない環境です。`--fix -y` で、確かめずに全部を直すか、端末で実行してください");
            return 2;
        }
        for m in &plan.moves {
            if all {
                accepted.push(m.clone());
                continue;
            }
            print!("{} を動かしますか？ [y]es / [n]o / [a]ll / [q]uit: ", show(root, &m.from));
            let _ = std::io::stdout().flush();
            let mut line = String::new();
            if stdin.lock().read_line(&mut line).unwrap_or(0) == 0 {
                break;
            }
            match line.trim().to_lowercase().as_str() {
                "y" | "yes" => accepted.push(m.clone()),
                "a" | "all" => {
                    all = true;
                    accepted.push(m.clone());
                }
                "q" | "quit" => break,
                _ => {}
            }
        }
        if accepted.is_empty() {
            report_info("何も直しませんでした");
            continue;
        }
        match apply(root, &accepted) {
            Ok(changed) => {
                report_info(&format!("{} 件を動かしました（import を書き換えたファイル: {} 件）。モジュール名が変わるので、`comatype generate` で作り直してください", accepted.len(), changed.len()));
                pending += plan.moves.len() - accepted.len();
            }
            Err(e) => {
                eprintln!("直せませんでした: {e}");
                return 2;
            }
        }
    }
    if pending > 0 && !opts.fix {
        1
    } else {
        0
    }
}

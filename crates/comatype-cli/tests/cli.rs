use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

fn project(files: &[(&str, &str)]) -> PathBuf {
    let root = std::env::temp_dir().join(format!("comatype-cli-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("comatfiles")).unwrap();
    fs::write(root.join("comatype.config.json"), r#"{"services":{"api":{"comatDir":"./comatfiles"}}}"#).unwrap();
    for (p, c) in files {
        let path = root.join("comatfiles").join(p);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, c).unwrap();
    }
    root
}

fn run(bin: &str, args: &[&str], root: &PathBuf) -> (i32, String, String) {
    let out = Command::new(bin).args(args).arg("--config").arg(root).output().unwrap();
    (out.status.code().unwrap_or(-1), String::from_utf8_lossy(&out.stdout).into(), String::from_utf8_lossy(&out.stderr).into())
}

const INIT: &str = "wrapper auth { s401 }\nwrapper log { }\ncookie session { httpOnly: true }\n";

fn sample() -> PathBuf {
    project(&[
        ("init.comat", INIT),
        ("get_open.comat", "s200 none\n"),
        ("a/defaults.comat", "wrap auth\n"),
        ("a/get_x.comat", "s200 none\n"),
        ("a/put_x.comat", "s200 none\n"),
        ("b/defaults.comat", "wrap auth\nwrap log\n"),
        ("b/get_y.comat", "s200 none\n"),
        ("c/defaults.comat", "wrap log\nwrap auth\n"),
        ("c/get_z.comat", "s200 none\n"),
    ])
}

#[test]
fn endpoints_lists_method_and_path_sorted() {
    let (code, out, err) = run(env!("CARGO_BIN_EXE_comatype"), &["endpoints", "--no-color"], &sample());
    assert_eq!(code, 0, "{err}");
    assert_eq!(out.lines().collect::<Vec<_>>(), ["GET /a/x", "PUT /a/x", "GET /b/y", "GET /c/z", "GET /open"], "{out}");
}

#[test]
fn endpoints_all_shows_types_wrap_and_cache() {
    let root = project(&[("init.comat", INIT), ("[id]/get.comat", "cache 5000\nparams { id: uuid }\ns200 { n: int }\n")]);
    let (code, out, _) = run(env!("CARGO_BIN_EXE_comatype"), &["endpoints", "-a", "--no-color"], &root);
    assert_eq!(code, 0);
    assert!(out.contains("GET     /:id"), "{out}");
    assert!(out.contains("params  { id: uuid }") && out.contains("200 { n: int }") && out.contains("cache 5000"), "{out}");
}

#[test]
fn endpoints_group_splits_by_exact_wrap_order() {
    let (code, out, _) = run(env!("CARGO_BIN_EXE_comatype"), &["endpoints", "-g", "--no-color"], &sample());
    assert_eq!(code, 0);
    // No wrap / auth / auth > log / log > auth are separate groups (exact match including order)
    for h in ["-- no wrap --", "-- wrap: auth --", "-- wrap: auth > log --", "-- wrap: log > auth --"] {
        assert!(out.contains(h), "{h} is missing:\n{out}");
    }
    let auth = out.split("-- wrap: auth --").nth(1).unwrap().split("--").next().unwrap();
    assert!(auth.contains("GET /a/x") && auth.contains("PUT /a/x") && !auth.contains("/b/y"), "{auth}");
}

#[test]
fn endpoints_color_is_opt_in_and_marks_wraps() {
    let (_, plain, _) = run(env!("CARGO_BIN_EXE_comatype"), &["endpoints", "--no-color"], &sample());
    assert!(!plain.contains('\x1b'));
    let (_, colored, _) = run(env!("CARGO_BIN_EXE_comatype"), &["endpoints", "--color"], &sample());
    assert!(colored.contains("\x1b[") && colored.contains("#") && colored.contains(" wrap: auth"), "{colored}");
    // /a/x with the same wrap gets the same color; /b/y with a different wrap gets another color
    let line = |m: &str, p: &str| colored.lines().find(|l| l.starts_with(m) && l.contains(p)).unwrap().to_string();
    let color_of = |l: &str| l.split("\x1b[").nth(1).unwrap().split('m').next().unwrap().to_string();
    assert_eq!(color_of(&line("GET", "/a")), color_of(&line("PUT", "/a")));
    assert_ne!(color_of(&line("GET", "/a")), color_of(&line("GET", "/b")));
}

#[test]
fn comat_is_an_alias_of_comatype() {
    let (code, out, _) = run(env!("CARGO_BIN_EXE_comat"), &["endpoints", "--no-color"], &sample());
    assert_eq!(code, 0);
    assert!(out.contains("GET /a/x"));
}

#[test]
fn check_topic_filters_diagnostics() {
    let root = project(&[
        ("init.comat", &format!("{INIT}cache 100\n")),
        ("defaults.comat", ""),
        ("get_a.comat", "cache 1000\nwrap auth\ns200 none\n"),
    ]);
    let bin = env!("CARGO_BIN_EXE_comatype");
    let (code, _, err) = run(bin, &["check", "cache"], &root);
    assert_eq!(code, 0, "{err}");
    assert!(err.contains("init.comat") && err.contains("cache has no effect in") || err.contains("cache"), "{err}");
    assert!(err.contains("cache: 0 error(s)"), "{err}");
    // No cache diagnostics appear in the wrap topic
    let (_, _, err) = run(bin, &["check", "wrap"], &root);
    assert!(!err.contains("the endpoint with cache is wrapped"), "{err}");
    // An unknown topic lists the valid topics and exits with code 2
    let (code, _, err) = run(bin, &["check", "nope"], &root);
    assert_eq!(code, 2);
    assert!(err.contains("cache") && err.contains("wrap") && err.contains("path"), "{err}");
}

#[test]
fn check_topic_reports_errors_with_exit_code_1() {
    let root = project(&[("init.comat", INIT), ("post_a.comat", "cache 1000\ns200 none\n")]);
    let (code, _, err) = run(env!("CARGO_BIN_EXE_comatype"), &["check", "cache"], &root);
    assert_eq!(code, 1, "{err}");
    assert!(err.contains("cache can only be written in get / query"), "{err}");
}

#[test]
fn check_warns_unused_wrapper_and_cookie_without_declaration() {
    let root = project(&[("init.comat", "wrapper auth { s401 }\n"), ("get_a.comat", "s200 none\n")]);
    let (code, _, err) = run(env!("CARGO_BIN_EXE_comatype"), &["check", "wrap"], &root);
    assert_eq!(code, 0);
    assert!(err.contains("wrapper `auth` is not enabled in any endpoint"), "{err}");
    let root = project(&[("init.comat", ""), ("defaults.comat", "cookie on\n"), ("get_a.comat", "s200 none\n")]);
    let (_, _, err) = run(env!("CARGO_BIN_EXE_comatype"), &["check", "cookie"], &root);
    assert!(err.contains("cookie declaration"), "{err}");
}

fn write_tree(files: &[(&str, &str)]) -> PathBuf {
    let root = std::env::temp_dir().join(format!("comatype-fmt-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&root);
    for (p, c) in files {
        let path = root.join(p);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, c).unwrap();
    }
    root
}

fn format_cmd(args: &[&str]) -> (i32, String, String) {
    let out = Command::new(env!("CARGO_BIN_EXE_comatype")).arg("format").args(args).output().unwrap();
    (out.status.code().unwrap_or(-1), String::from_utf8_lossy(&out.stdout).into(), String::from_utf8_lossy(&out.stderr).into())
}

const U: &str = "import U from ../../types/U.comat\nparams { id: uuid }\ns200 U\n";

fn fmt_project() -> PathBuf {
    write_tree(&[
        ("types/U.comat", "U { name: string }\n"),
        ("comatfiles/init.comat", ""),
        ("comatfiles/user/put_[id].comat", U), // deprecated → recommended
        ("comatfiles/user/get__id.comat", U),  // removed → recommended
        ("comatfiles/old/:uid/delete.comat", "params { uid: uuid }\ns204 none\n"), // removed directory name
        ("comatfiles/user/post_login.comat", "s204 none\n"), // nothing to fix
    ])
}

#[test]
fn format_suggests_without_touching_files_and_exits_1() {
    let root = fmt_project();
    let dir = root.join("comatfiles");
    let (code, out, err) = format_cmd(&[dir.to_str().unwrap()]);
    assert_eq!(code, 1, "{err}");
    assert!(out.contains("user/put_[id].comat") && out.contains("user/[id]/put.comat"), "{out}");
    assert!(out.contains("user/get__id.comat") && out.contains("user/[id]/get.comat"), "{out}");
    assert!(out.contains("old/:uid/delete.comat") && out.contains("old/[uid]/delete.comat"), "{out}");
    assert!(!out.contains("post_login"), "{out}");
    assert!(err.contains("--fix"), "{err}");
    // Nothing has changed
    assert!(dir.join("user/put_[id].comat").exists() && !dir.join("user/[id]").exists());
}

#[test]
fn format_fix_yes_moves_files_and_rewrites_imports() {
    let root = fmt_project();
    let dir = root.join("comatfiles");
    let (code, _, err) = format_cmd(&[dir.to_str().unwrap(), "--fix", "-y"]);
    assert_eq!(code, 0, "{err}");
    assert!(dir.join("user/[id]/put.comat").exists() && dir.join("user/[id]/get.comat").exists());
    assert!(dir.join("old/[uid]/delete.comat").exists());
    assert!(!dir.join("user/put_[id].comat").exists() && !dir.join("user/get__id.comat").exists() && !dir.join("old/:uid").exists());
    // It is one level deeper, so the relative import path gets one more segment
    assert!(fs::read_to_string(dir.join("user/[id]/put.comat")).unwrap().starts_with("import U from ../../../types/U.comat"));
    // After fixing, the check passes and there is nothing left to fix
    let (code, ..) = format_cmd(&[dir.to_str().unwrap()]);
    assert_eq!(code, 0);
    let out = Command::new(env!("CARGO_BIN_EXE_comatype")).arg("check").arg("--config").arg(&root).output().unwrap();
    let _ = out; // There is no config file, so it is unused here
}

#[test]
fn format_works_from_config_dir_and_the_result_checks() {
    let root = fmt_project();
    fs::write(root.join("comatype.config.json"), r#"{"services":{"api":{"comatDir":"./comatfiles"}}}"#).unwrap();
    let (code, _, err) = format_cmd(&[root.to_str().unwrap(), "--fix", "-y"]);
    assert_eq!(code, 0, "{err}");
    let out = Command::new(env!("CARGO_BIN_EXE_comatype")).arg("check").arg("--config").arg(&root).output().unwrap();
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(out.status.success(), "{err}");
    let (_, listing, _) = run(env!("CARGO_BIN_EXE_comatype"), &["endpoints", "--no-color"], &root);
    assert!(listing.contains("PUT /user/:id") && listing.contains("GET /user/:id") && listing.contains("DELETE /old/:uid"), "{listing}");
}

#[test]
fn format_skips_risky_moves() {
    let root = write_tree(&[
        ("comatfiles/init.comat", ""),
        // `path ./...` changes its path when a directory is added
        ("comatfiles/user/get_[id].comat", "path ./x\nparams { id: uuid }\ns204 none\n"),
        // There is a move target
        ("comatfiles/a/put_[id].comat", "params { id: uuid }\ns204 none\n"),
        ("comatfiles/a/[id]/put.comat", "params { id: uuid }\ns204 none\n"),
        // There is a defaults.comat at the move target
        ("comatfiles/b/get_[id].comat", "params { id: uuid }\ns204 none\n"),
        ("comatfiles/b/[id]/defaults.comat", "cookie on\n"),
    ]);
    let dir = root.join("comatfiles");
    let (code, out, err) = format_cmd(&[dir.to_str().unwrap(), "--fix", "-y"]);
    assert_eq!(code, 0, "{err}");
    assert!(!out.contains("->"), "{out}");
    assert!(
        err.contains("skipped") && err.contains("path ./") && err.contains("already exists") && err.contains("defaults.comat"),
        "{err}"
    );
    assert!(dir.join("user/get_[id].comat").exists() && dir.join("a/put_[id].comat").exists() && dir.join("b/get_[id].comat").exists());
}

#[test]
fn format_fix_without_a_terminal_needs_yes() {
    let root = fmt_project();
    let dir = root.join("comatfiles");
    let (code, _, err) = format_cmd(&[dir.to_str().unwrap(), "--fix"]);
    assert_eq!(code, 2);
    assert!(err.contains("-y"), "{err}");
    assert!(dir.join("user/put_[id].comat").exists());
}

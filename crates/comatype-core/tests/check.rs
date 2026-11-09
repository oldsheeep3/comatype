use comatype_core::diag::Severity;
use comatype_core::project::{check_config, CheckResult};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

/// files: (path relative to comatfiles, contents). Files that belong in `../types/` are written as "../types/X.comat"
fn run(files: &[(&str, &str)]) -> CheckResult {
    run_with_config(r#"{"services":{"api":{"comatDir":"./comatfiles"}}}"#, files)
}

fn run_with_config(config: &str, files: &[(&str, &str)]) -> CheckResult {
    let root: PathBuf = std::env::temp_dir().join(format!("comatype-test-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("comatfiles")).unwrap();
    fs::write(root.join("comatype.config.json"), config).unwrap();
    for (p, c) in files {
        let path = root.join("comatfiles").join(p);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, c).unwrap();
    }
    let r = check_config(&root, None);
    let _ = fs::remove_dir_all(&root);
    r
}

fn errors(r: &CheckResult) -> Vec<String> {
    r.diagnostics.iter().filter(|d| d.severity == Severity::Error).map(|d| d.message.clone()).collect()
}

fn has_error(r: &CheckResult, needle: &str) -> bool {
    errors(r).iter().any(|m| m.contains(needle))
}

const INIT: &str = "wrapper auth { s401 E }\nwrapper log { }\nE { code: string }\n";

#[test]
fn derives_paths_and_groups() {
    let r = run(&[
        ("init.comat", INIT),
        ("get.comat", "s200 none"),
        ("(g)/post_a.comat", "s200 none"),
        ("users/get_[id].comat", "params { id: uuid }\ns200 none"),
        ("users/(g)/defaults.comat", "wrap auth"),
        ("users/(g)/get_list.comat", "s200 none"),
        ("users/get_me.comat", "path ./me\ns200 none"),
        ("get_ping.comat", "path /ping\ns200 none"),
    ]);
    assert!(errors(&r).is_empty(), "{:?}", r.diagnostics);
    let eps = &r.ir.unwrap().services["api"].endpoints;
    let find = |m: &str| eps.iter().find(|e| e.module == m).unwrap_or_else(|| panic!("{m}"));
    assert_eq!(find("get").path, "/");
    assert_eq!(find("post_a").path, "/a");
    assert_eq!(find("users/get__id").path, "/users/:id");
    assert_eq!(find("users/get_list").path, "/users/list");
    assert_eq!(find("users/get_list").wraps, vec!["auth"]);
    assert_eq!(find("users/get_me").path, "/users/me");
    assert_eq!(find("get_ping").path, "/ping");
}

#[test]
fn wrap_order_outer_to_inner() {
    let r = run(&[
        ("init.comat", INIT),
        ("defaults.comat", "wrap auth\nwrap log"),
        ("a/defaults.comat", "wrap log off\nwrap log"),
        ("a/get.comat", "s200 none"),
        ("b/defaults.comat", "wrap auth off"),
        ("b/get.comat", "s200 none"),
        ("c/get.comat", "wrap auth off\ns200 none"),
    ]);
    assert!(errors(&r).is_empty(), "{:?}", r.diagnostics);
    let eps = &r.ir.unwrap().services["api"].endpoints;
    let w = |m: &str| eps.iter().find(|e| e.module == m).unwrap().wraps.clone();
    assert_eq!(w("a/get"), vec!["auth", "log"]);
    assert_eq!(w("b/get"), vec!["log"]);
    assert_eq!(w("c/get"), vec!["log"]);
}

#[test]
fn wrapper_status_added_only_when_enabled() {
    let r = run(&[
        ("init.comat", INIT),
        ("defaults.comat", "wrap auth"),
        ("a/get.comat", "s200 none"),
        ("b/get.comat", "wrap auth off\ns200 none"),
    ]);
    let eps = &r.ir.unwrap().services["api"].endpoints;
    let codes = |m: &str| eps.iter().find(|e| e.module == m).unwrap().responses.iter().map(|x| x.status).collect::<Vec<_>>();
    assert_eq!(codes("a/get"), vec![200, 401]);
    assert_eq!(codes("b/get"), vec![200]);
}

#[test]
fn spread_and_empty() {
    let r = run(&[
        ("init.comat", INIT),
        ("../types/U.comat", "U { a: string, b: int, c?: bool }"),
        ("post.comat", "import U from ../types/U.comat\nbody { ...U, b: empty, d: string }\ns200 none"),
    ]);
    assert!(errors(&r).is_empty(), "{:?}", r.diagnostics);
    let ir = r.ir.unwrap();
    let body = serde_json::to_value(ir.services["api"].endpoints[0].body.as_ref().unwrap()).unwrap();
    let names: Vec<&str> = body["fields"].as_array().unwrap().iter().map(|f| f["name"].as_str().unwrap()).collect();
    assert_eq!(names, vec!["a", "c", "d"]);
}

#[test]
fn header_precedence() {
    let r = run(&[
        ("init.comat", INIT),
        ("defaults.comat", "header { X: string }\nheaderRes { X: int }\nheaderReq { Y: bool }"),
        ("get.comat", "s200 none, { X: uuid }\ns204 none"),
    ]);
    assert!(errors(&r).is_empty(), "{:?}", r.diagnostics);
    let ep = &r.ir.unwrap().services["api"].endpoints[0].clone();
    let ty =
        |code: u16| serde_json::to_value(&ep.responses.iter().find(|x| x.status == code).unwrap().headers[0].ty).unwrap()["name"].clone();
    assert_eq!(ty(200), "uuid"); // per status > headerRes
    assert_eq!(ty(204), "int"); // headerRes > header
    assert_eq!(ep.request_headers.len(), 2);
}

#[test]
fn errors_are_reported() {
    let cases: &[(&[(&str, &str)], &str)] = &[
        (&[("init.comat", INIT), ("fetch_a.comat", "s200 none")], "メソッド"),
        (&[("init.comat", INIT), ("get_[id].comat", "s200 none")], "params に宣言されていません"),
        (&[("init.comat", INIT), ("get_a.comat", "params { id: uuid }\ns200 none")], "path"),
        (&[("init.comat", INIT), ("get_a.comat", "s200 none"), ("(g)/get_a.comat", "s200 none")], "重複"),
        (&[("init.comat", INIT), ("get_a.comat", "wrap nope\ns200 none")], "宣言されていません"),
        (&[("init.comat", INIT), ("get_a.comat", "s200 Missing")], "見つかりません"),
        (&[("init.comat", INIT), ("post_a.comat", "body { a: string }\nbody { b: string }\ns200 none")], "1 つだけ"),
        (&[("init.comat", INIT), ("post_a.comat", "body { a: none }\ns200 none")], "none"),
        (&[("init.comat", INIT), ("get_a.comat", "s200 { a: empty[] }")], "empty"),
        (&[("init.comat", INIT), ("get_a.comat", "s200 none\ns200 none")], "重複"),
        (&[("init.comat", INIT), ("get_a.comat", "baseUrl http://x\ns200 none")], "baseUrl"),
        (&[("init.comat", INIT), ("defaults.comat", "body { a: string }")], "defaults.comat"),
        (&[("init.comat", INIT), ("get_a.comat", "path nope\ns200 none")], "`/` か `./`"),
        (&[("init.comat", INIT), ("get_a.comat", "s200 string(pattern: \"[\"")], "必要です"),
        (&[("init.comat", INIT), ("a/init.comat", INIT)], "直下"),
        (
            &[
                ("init.comat", INIT),
                ("../types/T.comat", "T { ...T2 }\nT2 { ...T }"),
                ("get_a.comat", "import T from ../types/T.comat\ns200 T"),
            ],
            "循環",
        ),
    ];
    for (files, needle) in cases {
        let r = run(files);
        assert!(has_error(&r, needle), "期待 `{needle}` 実際 {:?}", r.diagnostics);
        assert!(r.ir.is_none());
    }
}

#[test]
fn syntax_error_has_position() {
    let r = run(&[("init.comat", INIT), ("get_a.comat", "s200 none\nbody ?")]);
    let d = r.diagnostics.iter().find(|d| d.is_error()).unwrap();
    assert_eq!((d.file.as_str(), d.line), ("comatfiles/get_a.comat", 2));
}

#[test]
fn cookie_settings_are_checked() {
    let ok = run(&[
        ("init.comat", "cookie session { httpOnly: true, secure: true, sameSite: none, path: /api, maxAge: 3600 }"),
        ("get.comat", "cookie on\ns200 none"),
    ]);
    assert!(errors(&ok).is_empty(), "{:?}", ok.diagnostics);
    let svc = &ok.ir.unwrap().services["api"];
    assert_eq!(svc.cookie.as_ref().unwrap().settings["maxAge"], "3600");

    let cases: &[(&str, &str)] = &[
        ("cookie session { secure: yes }", "不正な値"),
        ("cookie session { sameSite: lax2 }", "不正な値"),
        ("cookie session { sameSite: none }", "secure: true が必要"),
        ("cookie session { httpOnly: true, httpOnly: false }", "重複"),
        ("cookie session { nope: 1 }", "未知の cookie の設定"),
        ("cookie session { maxAge: -5 }", "不正な値"),
        ("cookie session { path: api }", "`/` で始めて"),
    ];
    for (init, needle) in cases {
        let r = run(&[("init.comat", init)]);
        assert!(has_error(&r, needle), "期待 `{needle}` 実際 {:?}", r.diagnostics);
    }
}

#[test]
fn only_registered_status_codes_are_allowed() {
    for bad in ["s499 none", "s306 none", "s600 none", "s099 none"] {
        let r = run(&[("init.comat", INIT), ("get.comat", bad)]);
        assert!(has_error(&r, "未定義"), "{bad}: {:?}", r.diagnostics);
        assert!(r.ir.is_none());
    }
    // All standard codes can be used
    for (code, _) in comatype_core::status::BUILTIN {
        let body = if comatype_core::status::no_body(*code) { "none" } else { "{ a: string }" };
        let r = run(&[("init.comat", INIT), ("get.comat", &format!("s{code} {body}"))]);
        assert!(errors(&r).is_empty(), "s{code}: {:?}", r.diagnostics);
    }
    // Same inside a wrapper
    let r = run(&[("init.comat", "wrapper w { s498 E }\nE { code: string }\n"), ("get.comat", "s200 none")]);
    assert!(has_error(&r, "未定義"));
}

#[test]
fn additional_status_codes_extend_the_registry() {
    let cfg = r#"{"services":{"api":{"comatDir":"./comatfiles"}},"additionalStatusCodes":[{"status":299,"message":"Custom"},{"status":499,"message":"Client Closed Request"}]}"#;
    let r = run_with_config(cfg, &[("init.comat", INIT), ("get.comat", "s299 none\ns499")]);
    assert!(errors(&r).is_empty(), "{:?}", r.diagnostics);
    let codes: Vec<u16> = r.ir.unwrap().services["api"].endpoints[0].responses.iter().map(|x| x.status).collect();
    assert_eq!(codes, vec![299, 499]);

    for (cfg, needle) in [
        (r#"{"services":{},"additionalStatusCodes":[{"status":404,"message":"x"}]}"#, "標準で定義済み"),
        (r#"{"services":{},"additionalStatusCodes":[{"status":700,"message":"x"}]}"#, "100〜599"),
        (r#"{"services":{},"additionalStatusCodes":[{"status":299,"message":"a"},{"status":299,"message":"b"}]}"#, "重複"),
        (r#"{"services":{},"additionalStatusCodes":[{"status":299,"message":" "}]}"#, "message が空"),
    ] {
        let r = run_with_config(cfg, &[]);
        assert!(has_error(&r, needle), "{needle}: {:?}", r.diagnostics);
    }
}

#[test]
fn omitted_status_body_defaults_to_message_object_or_none() {
    let r = run(&[
        ("init.comat", "wrapper w { s401 }\n"),
        ("defaults.comat", "wrap w"),
        // Body omitted: do not mistake the sNNN on the next line for a type
        ("get.comat", "s200\ns204\ns404, { \"X-Why\"?: string }\ns500 none"),
    ]);
    assert!(errors(&r).is_empty(), "{:?}", r.diagnostics);
    let ir = r.ir.unwrap();
    let ep = &ir.services["api"].endpoints[0];
    let by = |c: u16| ep.responses.iter().find(|x| x.status == c).unwrap();
    let msg = serde_json::to_value(by(200).body.as_ref().unwrap()).unwrap();
    assert_eq!(msg["kind"], "object");
    assert_eq!(msg["fields"][0]["name"], "message");
    assert_eq!(msg["fields"][0]["type"]["name"], "string");
    assert!(by(204).body.is_none(), "本文を持てないコードの既定は none");
    assert!(by(404).body.is_some() && by(404).headers.len() == 1);
    assert!(by(500).body.is_none());
    assert!(by(401).body.is_some(), "wrapper の中でも省略できる");
}

#[test]
fn bodyless_statuses_cannot_have_a_body() {
    for code in ["s204", "s205", "s304", "s101", "s100"] {
        let r = run(&[("init.comat", INIT), ("get.comat", &format!("{code} E"))]);
        assert!(has_error(&r, "ボディを持てません"), "{code}: {:?}", r.diagnostics);
    }
}

fn warnings(r: &CheckResult) -> Vec<String> {
    r.diagnostics.iter().filter(|d| d.severity == Severity::Warning).map(|d| d.message.clone()).collect()
}

fn cache_of(r: &CheckResult, module: &str) -> String {
    let ir = r.ir.as_ref().expect("ir");
    let ep = ir.services["api"].endpoints.iter().find(|e| e.module == module).expect("endpoint");
    serde_json::to_string(&ep.cache).unwrap()
}

#[test]
fn cache_is_read_for_get_and_query() {
    let r = run(&[
        ("init.comat", INIT),
        ("get_a.comat", "cache 5000\ns200 none\n"),
        ("get_b.comat", "cache 60000 cookie\ns200 none\n"),
        ("get_c.comat", "cache off\ns200 none\n"),
        ("get_d.comat", "s200 none\n"),
        ("query_e.comat", "cache 100\nbody { q: string }\ns200 none\n"),
    ]);
    assert!(errors(&r).is_empty(), "{:?}", errors(&r));
    assert_eq!(cache_of(&r, "get_a"), r#"{"mode":"memory","ttlMs":5000}"#);
    assert_eq!(cache_of(&r, "get_b"), r#"{"mode":"cookie","ttlMs":60000}"#);
    assert_eq!(cache_of(&r, "get_c"), r#"{"mode":"off"}"#);
    assert_eq!(cache_of(&r, "get_d"), "null");
    assert_eq!(cache_of(&r, "query_e"), r#"{"mode":"memory","ttlMs":100}"#);
}

#[test]
fn cache_on_other_methods_is_an_error() {
    let r = run(&[("init.comat", INIT), ("post_a.comat", "cache 1000\ns200 none\n")]);
    assert!(has_error(&r, "cache は get / query"), "{:?}", errors(&r));
    // `cache off` is harmless on any method
    let ok = run(&[("init.comat", INIT), ("post_a.comat", "cache off\ns200 none\n")]);
    assert!(errors(&ok).is_empty(), "{:?}", errors(&ok));
}

#[test]
fn cache_in_defaults_and_init_warns_and_is_ignored() {
    let r = run(&[("init.comat", &format!("{INIT}cache 100\n")), ("defaults.comat", "cache 200\n"), ("get_a.comat", "s200 none\n")]);
    assert!(errors(&r).is_empty(), "{:?}", errors(&r));
    let w = warnings(&r);
    assert!(w.iter().any(|m| m.contains("init.comat") && m.contains("cache")), "{w:?}");
    assert!(w.iter().any(|m| m.contains("defaults.comat") && m.contains("cache")), "{w:?}");
    assert_eq!(cache_of(&r, "get_a"), "null");
}

#[test]
fn cache_syntax_errors() {
    for bad in ["cache\n", "cache 0\n", "cache abc\n", "cache 100 memory\n", "cache 100 cookie extra\n"] {
        let r = run(&[("init.comat", INIT), ("get_a.comat", &format!("{bad}s200 none\n"))]);
        assert!(!errors(&r).is_empty(), "{bad:?} はエラーのはず");
    }
}

#[test]
fn cache_cookie_with_a_short_ttl_warns() {
    let r = run(&[("init.comat", INIT), ("get_a.comat", "cache 500 cookie\ns200 none\n")]);
    assert!(errors(&r).is_empty());
    assert!(warnings(&r).iter().any(|m| m.contains("秒単位")), "{:?}", warnings(&r));
}

fn route_of(r: &CheckResult, module: &str) -> String {
    let ir = r.ir.as_ref().expect("ir");
    let ep = ir.services["api"].endpoints.iter().find(|e| e.module == module).unwrap_or_else(|| panic!("{module} が無い"));
    format!("{} {}", ep.method, ep.path)
}

#[test]
fn bracket_directories_and_files_make_dynamic_segments() {
    let r = run(&[
        ("init.comat", INIT),
        // Recommended: directory `[id]` / `[userid]`
        ("path/[id]/user/[userid]/get.comat", "params { id: string, userid: string }\ns200 none\n"),
        // Deprecated but allowed: file name `get_[userid]`
        ("path/[id]/team/get_[userid].comat", "params { id: string, userid: string }\ns200 none\n"),
        ("path/[id]/org/put_[userid].comat", "params { id: string, userid: string }\ns200 none\n"),
    ]);
    assert!(errors(&r).is_empty(), "{:?}", errors(&r));
    // In generated module names, the dynamic part becomes `__`
    assert_eq!(route_of(&r, "path/__id/user/__userid/get"), "get /path/:id/user/:userid");
    assert_eq!(route_of(&r, "path/__id/team/get__userid"), "get /path/:id/team/:userid");
    assert_eq!(route_of(&r, "path/__id/org/put__userid"), "put /path/:id/org/:userid");
}

#[test]
fn old_dynamic_names_are_removed() {
    // File names `get__id` and `get_:id`, and directory names `:id` and `__id`, are removed (error)
    for (file, needle) in
        [("a/get__id.comat", "廃止"), ("a/get_:id.comat", "廃止"), ("a/:id/get.comat", "廃止"), ("a/__id/get.comat", "廃止")]
    {
        let r = run(&[("init.comat", INIT), (file, "params { id: string }\ns200 none\n")]);
        assert!(has_error(&r, needle), "{file}: {:?}", errors(&r));
    }
}

#[test]
fn explicit_path_may_use_colon() {
    // With an explicit path, `:id` is allowed (but an explicit path is deprecated and warns)
    let r = run(&[("init.comat", INIT), ("get_user.comat", "path /user/:id\nparams { id: string }\ns200 none\n")]);
    assert!(errors(&r).is_empty(), "{:?}", errors(&r));
    assert_eq!(route_of(&r, "get_user"), "get /user/:id");
}

#[test]
fn bracket_collisions_and_bad_names_are_errors() {
    let r = run(&[
        ("init.comat", INIT),
        ("a/[id]/get.comat", "params { id: string }\ns200 none\n"),
        ("a/get_[id].comat", "params { id: string }\ns200 none\n"),
    ]);
    assert!(has_error(&r, "重複"), "{:?}", errors(&r));
    for dir in ["a/[...rest]/get.comat", "a/[]/get.comat", "a/[[id]]/get.comat", "a/[_id]/get.comat"] {
        let r = run(&[("init.comat", INIT), (dir, "s200 none\n")]);
        assert!(!errors(&r).is_empty(), "{dir} はエラーのはず");
    }
}

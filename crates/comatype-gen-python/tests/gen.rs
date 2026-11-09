use comatype_core::project::check_config;
use comatype_gen_python::{generate, GenFile, Role};
use std::fs;
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

fn gen(files: &[(&str, &str)], role: Role) -> Result<Vec<GenFile>, String> {
    let root = std::env::temp_dir().join(format!("comatype-gen-py-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("comatfiles")).unwrap();
    fs::write(root.join("comatype.config.json"), r#"{"services":{"api":{"comatDir":"./comatfiles"}}}"#).unwrap();
    for (p, c) in files {
        let path = root.join("comatfiles").join(p);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, c).unwrap();
    }
    let r = check_config(&root, None);
    let _ = fs::remove_dir_all(&root);
    let ir = r.ir.unwrap_or_else(|| panic!("{:?}", r.diagnostics));
    generate(&ir.services["api"], role)
}

fn file<'a>(fs: &'a [GenFile], path: &str) -> &'a str {
    &fs.iter().find(|f| f.path == path).unwrap_or_else(|| panic!("{path}")).content
}

fn has(hay: &str, needle: &str) -> bool {
    let norm = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    norm(hay).contains(&norm(needle))
}

const INIT: &str = "wrapper auth { ctx { uid: uuid } s401 E }\nE { code: string }\n";

#[test]
fn models() {
    let out = gen(
        &[
            ("init.comat", INIT),
            ("../types/T.comat", "enum Role { admin, member }\nT { nickName: string(1..5), age?: int(0..150), zip: string(pattern: \"^[0-9]+$\"), status: \"on\" | \"off\", role: Role, at: datetime | null, tags: string[], big: int64, blob?: bytes, home: { line?: string }, from: string }"),
            ("get.comat", "import T from ../types/T.comat\ns200 T"),
        ],
        Role::Client,
    )
    .unwrap();
    let m = file(&out, "models.py");
    for needle in [
        "nick_name: _t.Annotated[str, _p.Field(min_length=1, max_length=5)] = _p.Field(alias=\"nickName\")",
        "age: _t.Optional[_t.Annotated[int, _p.Field(ge=0, le=150)]] = _p.Field(default=None, json_schema_extra={\"omit_none\": True})",
        "_p.Field(pattern=\"^[0-9]+$\")",
        "status: _t.Literal[\"on\", \"off\"]",
        "role: Role",
        "at: _t.Optional[_s.DateTime]",
        "tags: list[str]",
        "big: _s.Int64",
        "blob: _t.Optional[_s.Bytes]",
        "home: THome",
        "class THome(_p.BaseModel)",
        "from_: str = _p.Field(alias=\"from\")",
        "class Role(str, _en.Enum)",
        "admin = \"admin\"",
    ] {
        assert!(has(m, needle), "{needle}\n{m}");
    }
    assert!(out.iter().any(|f| f.path == "__init__.py"));
}

#[test]
fn roles_differ() {
    let files = [("init.comat", INIT), ("defaults.comat", "wrap auth\ncookie on"), ("user/get_a.comat", "s200 none")];
    let c = gen(&files, Role::Client).unwrap();
    let s = gen(&files, Role::Server).unwrap();
    let (ce, se) = (file(&c, "user/get_a.py"), file(&s, "user/get_a.py"));
    assert!(!has(ce, "ctx: Ctx") && !has(ce, "cookie:"));
    assert!(has(se, "ctx: Ctx") && has(se, "class Ctx(_i.AuthCtx)"));
    assert!(has(se, "from .. import comatype_init as _i") && has(se, "ctx_cls=Ctx"));
    assert!(has(file(&c, "comatype_init.py"), "auth: _c.ComatypeWrap[_t.Any]"));
    let si = file(&s, "comatype_init.py");
    assert!(has(si, "auth: _c.ComatypeWrap[AuthCtx]") && has(si, "class S401(_c.Status)") && has(si, "class AuthCtx"));
    assert!(c.iter().any(|f| f.path == "user/__init__.py"));
}

#[test]
fn cookie_field_only_when_cookie_on() {
    let init = "cookie session { httpOnly: true }\n";
    let on = gen(&[("init.comat", init), ("defaults.comat", "cookie on"), ("get.comat", "s200 none")], Role::Server).unwrap();
    let off = gen(&[("init.comat", init), ("get.comat", "s200 none")], Role::Server).unwrap();
    assert!(has(file(&on, "get.py"), "cookie: _c.Cookie | str | None = None") && has(file(&on, "get.py"), "http_only=True"));
    assert!(!has(file(&off, "get.py"), "cookie:"));
}

#[test]
fn unsupported_things_are_reported() {
    for (files, needle) in [
        (vec![("init.comat", INIT), ("class/get.comat", "s200 none")], "キーワード"),
        (vec![("init.comat", INIT), ("user-x/get.comat", "s200 none")], "モジュール名にできません"),
        (vec![("init.comat", INIT), ("models/get.comat", "s200 none")], "予約済み"),
        (vec![("init.comat", INIT), ("get_[id].comat", "params { id: { a: string } }\ns200 none")], "オブジェクト"),
    ] {
        let e = gen(&files, Role::Server).unwrap_err();
        assert!(e.contains(needle), "{e}");
    }
    // A module named get.py and a directory named get/ cannot coexist
    let e = gen(&[("init.comat", INIT), ("get.comat", "s200 none"), ("get/post_x.comat", "s200 none")], Role::Server).unwrap_err();
    assert!(e.contains("ディレクトリ"), "{e}");
}

use comatype_core::project::check_config;
use comatype_gen_go::{generate, GenFile, Role};
use std::fs;
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

fn gen(files: &[(&str, &str)], role: Role) -> Result<Vec<GenFile>, String> {
    let root = std::env::temp_dir().join(format!("comatype-gen-go-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
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
    generate(&ir.services["api"], role, "example.com/app/comatype")
}

fn file<'a>(fs: &'a [GenFile], path: &str) -> &'a str {
    &fs.iter().find(|f| f.path == path).unwrap_or_else(|| panic!("{path}")).content
}

const INIT: &str = "wrapper auth { ctx { uid: uuid } s401 E }\nE { code: string }\n";

#[test]
fn types_tags_and_options() {
    let out = gen(
        &[
            ("init.comat", INIT),
            ("../types/T.comat", "enum Role { admin, member }\nT { nickName: string(1..5), age?: int(0..150), zip: string(pattern: \"^[0-9]+$\"), status: \"on\" | \"off\", role: Role, at: datetime | null, tags: string[], big: int64, blob?: bytes, home: { line?: string } }"),
            ("get.comat", "import T from ../types/T.comat\ns200 T"),
        ],
        Role::Client,
    )
    .unwrap();
    let t = file(&out, "types/types.go");
    for needle in [
        "NickName string `json:\"nickName\" min:\"1\" max:\"5\"`",
        "Age *int `json:\"age,omitempty\" min:\"0\" max:\"150\"`",
        "pattern:\"^[0-9]+$\"",
        "oneof:\"on|off\"",
        "Role Role ",
        "At *time.Time `json:\"at\"`",
        "Tags []string",
        "Big comatype.Int64",
        "Blob []byte `json:\"blob,omitempty\"`",
        "Home THome ",
        "type THome struct",
        "RoleAdmin Role = \"admin\"",
    ] {
        assert!(t.replace("  ", " ").replace('\t', " ").split_whitespace().collect::<Vec<_>>().join(" ").contains(&needle.split_whitespace().collect::<Vec<_>>().join(" ")), "{needle}\n{t}");
    }
}

#[test]
fn roles_differ() {
    let files = [("init.comat", INIT), ("defaults.comat", "wrap auth"), ("get_a.comat", "s200 none")];
    let c = gen(&files, Role::Client).unwrap();
    let s = gen(&files, Role::Server).unwrap();
    let (ce, se) = (file(&c, "get_a/endpoint.go"), file(&s, "get_a/endpoint.go"));
    assert!(ce.contains("BuildRequest: ") && !ce.contains("ParseRequest"));
    assert!(se.contains("ParseRequest: ") && se.contains("comatype_init.AuthCtx") && !se.contains("BuildRequest"));
    assert!(se.contains("func S200() Response"));
    assert!(file(&c, "init/init.go").contains("Auth c.ComatypeWrap"));
    assert!(file(&s, "init/init.go").contains("Auth s.ComatypeWrap[AuthCtx]") && file(&s, "init/init.go").contains("func S401("));
}

#[test]
fn unsupported_things_are_reported() {
    let e = gen(&[("init.comat", INIT), ("get.comat", "s200 { a: string | int }")], Role::Server).unwrap_err();
    assert!(e.contains("ユニオン"), "{e}");
    let e = gen(&[("init.comat", INIT), ("types/get.comat", "s200 none")], Role::Server).unwrap_err();
    assert!(e.contains("types"), "{e}");
    let e = gen(&[("init.comat", INIT), ("get_[id].comat", "params { id: { a: string } }\ns200 none")], Role::Server).unwrap_err();
    assert!(e.contains("オブジェクト"), "{e}");
}

#[test]
fn cookie_methods_only_when_cookie_on() {
    let init = "cookie session { httpOnly: true }\n";
    let on = gen(&[("init.comat", init), ("defaults.comat", "cookie on"), ("get.comat", "s200 none")], Role::Server).unwrap();
    let off = gen(&[("init.comat", init), ("get.comat", "s200 none")], Role::Server).unwrap();
    assert!(file(&on, "get/endpoint.go").contains("WithCookie") && file(&on, "get/endpoint.go").contains("HTTPOnly: true"));
    assert!(!file(&off, "get/endpoint.go").contains("WithCookie"));
}

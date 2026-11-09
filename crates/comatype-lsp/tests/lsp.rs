//! Drives LSP messages through in-memory I/O to check them for real.

use comatype_lsp::run;
use serde_json::{json, Value};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

struct Project {
    root: PathBuf,
}

impl Project {
    fn new(files: &[(&str, &str)]) -> Project {
        let root = std::env::temp_dir().join(format!("comatype-lsp-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("comatfiles")).unwrap();
        fs::write(root.join("comatype.config.json"), r#"{"services":{"api":{"comatDir":"./comatfiles"}}}"#).unwrap();
        for (p, c) in files {
            let path = root.join(p);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, c).unwrap();
        }
        // Normalize symlinks such as /var → /private/var
        Project { root: root.canonicalize().unwrap() }
    }
    fn path(&self, rel: &str) -> PathBuf {
        self.root.join(rel)
    }
    fn uri(&self, rel: &str) -> String {
        format!("file://{}", self.path(rel).display())
    }
}

impl Drop for Project {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

/// Builds the messages to send, runs the server to the end, and returns the messages the server sent
struct Session {
    msgs: Vec<Value>,
    next_id: i64,
}

impl Session {
    fn new() -> Session {
        let mut s = Session { msgs: vec![], next_id: 1 };
        s.request("initialize", json!({"processId": null, "rootUri": null, "capabilities": {}}));
        s.notify("initialized", json!({}));
        s
    }
    fn notify(&mut self, method: &str, params: Value) {
        self.msgs.push(json!({"jsonrpc": "2.0", "method": method, "params": params}));
    }
    fn request(&mut self, method: &str, params: Value) -> i64 {
        let id = self.next_id;
        self.next_id += 1;
        self.msgs.push(json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}));
        id
    }
    fn open(&mut self, uri: &str, text: &str) {
        self.notify("textDocument/didOpen", json!({"textDocument": {"uri": uri, "languageId": "comat", "version": 1, "text": text}}));
    }
    fn change(&mut self, uri: &str, text: &str) {
        self.notify("textDocument/didChange", json!({"textDocument": {"uri": uri, "version": 2}, "contentChanges": [{"text": text}]}));
    }
    fn at(&mut self, method: &str, uri: &str, line: u64, character: u64) -> i64 {
        self.request(method, json!({"textDocument": {"uri": uri}, "position": {"line": line, "character": character}}))
    }
    fn finish(mut self) -> (Vec<Value>, i32) {
        self.request("shutdown", Value::Null);
        self.notify("exit", Value::Null);
        let mut input = Vec::new();
        for m in &self.msgs {
            let body = serde_json::to_vec(m).unwrap();
            input.extend(format!("Content-Length: {}\r\n\r\n", body.len()).into_bytes());
            input.extend(body);
        }
        let mut out = Vec::new();
        let code = run(&mut Cursor::new(input), &mut out).unwrap();
        let mut rest = &out[..];
        let mut msgs = Vec::new();
        while !rest.is_empty() {
            let header_end = rest.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
            let len: usize = std::str::from_utf8(&rest[..header_end]).unwrap().trim_start_matches("Content-Length: ").parse().unwrap();
            let body = &rest[header_end + 4..header_end + 4 + len];
            msgs.push(serde_json::from_slice(body).unwrap());
            rest = &rest[header_end + 4 + len..];
        }
        (msgs, code)
    }
}

fn response(out: &[Value], id: i64) -> &Value {
    out.iter().find(|m| m["id"] == json!(id)).unwrap_or_else(|| panic!("no response for id {id}"))
}

/// The last diagnostics published for that uri
fn last_diags<'a>(out: &'a [Value], uri: &str) -> Option<&'a Vec<Value>> {
    out.iter()
        .rev()
        .find(|m| m["method"] == "textDocument/publishDiagnostics" && m["params"]["uri"] == uri)
        .map(|m| m["params"]["diagnostics"].as_array().unwrap())
}

const INIT: &str = "wrapper auth { ctx { uid: uuid } s401 E }\nE { code: string }\n";
const TYPES: &str = "// type\nUser {\n    name: string,\n    nick?: string,\n}\n\nenum Role { admin, member }\n";

fn project() -> Project {
    Project::new(&[
        ("comatfiles/init.comat", INIT),
        ("comatfiles/defaults.comat", "wrap auth\n"),
        ("types/User.comat", TYPES),
        ("comatfiles/get_a.comat", "import User from ../types/User.comat\n\ns200 User\n"),
    ])
}

#[test]
fn initialize_and_shutdown() {
    let mut s = Session::new();
    let unknown = s.request("workspace/unknown", json!({}));
    let (out, code) = s.finish();
    let caps = &response(&out, 1)["result"]["capabilities"];
    assert_eq!(caps["textDocumentSync"]["change"], 1);
    assert_eq!(caps["definitionProvider"], true);
    assert_eq!(response(&out, unknown)["error"]["code"], -32601);
    assert_eq!(code, 0);
}

#[test]
fn exit_without_shutdown_is_an_error() {
    let mut s = Session::new();
    s.msgs.push(json!({"jsonrpc":"2.0","method":"exit"}));
    // finish() appends shutdown, so feed it directly
    let mut input = Vec::new();
    for m in &s.msgs {
        let body = serde_json::to_vec(m).unwrap();
        input.extend(format!("Content-Length: {}\r\n\r\n", body.len()).into_bytes());
        input.extend(body);
    }
    assert_eq!(run(&mut Cursor::new(input), &mut Vec::new()).unwrap(), 1);
}

#[test]
fn syntax_errors_appear_as_you_type_and_clear_when_fixed() {
    let p = project();
    let uri = p.uri("comatfiles/get_a.comat");
    let mut s = Session::new();
    s.open(&uri, "import User from ../types/User.comat\n\ns200 User\n");
    // Mid-typing: a block left open
    s.change(&uri, "import User from ../types/User.comat\n\nbody {\n    a: string,\n    b: \n");
    // Fix it
    s.change(&uri, "import User from ../types/User.comat\n\ns200 User\n");
    let (out, _) = s.finish();

    let all: Vec<&Value> =
        out.iter().filter(|m| m["method"] == "textDocument/publishDiagnostics" && m["params"]["uri"] == json!(uri)).collect();
    assert_eq!(all.len(), 3);
    assert!(all[0]["params"]["diagnostics"].as_array().unwrap().iter().all(|d| d["severity"] != 1), "no errors right after opening");
    let broken = all[1]["params"]["diagnostics"].as_array().unwrap();
    assert_eq!(broken.len(), 1, "only the syntax error (semantic checks are held back): {broken:?}");
    assert_eq!(broken[0]["severity"], 1);
    assert_eq!(broken[0]["source"], "comatype");
    assert!(broken[0]["range"]["start"]["line"].as_u64().unwrap() >= 4);
    assert!(last_diags(&out, &uri).unwrap().iter().all(|d| d["severity"] != 1), "the error disappears once fixed");
}

#[test]
fn unsaved_content_is_checked_not_the_disk() {
    let p = project();
    let uri = p.uri("comatfiles/get_a.comat");
    // The file on disk is valid. The content being edited (unsaved) in the editor has a type that does not exist
    let mut s = Session::new();
    s.open(&uri, "import User from ../types/User.comat\n\ns200 Missing\n");
    let (out, _) = s.finish();
    let d = last_diags(&out, &uri).unwrap();
    let err = d.iter().find(|d| d["severity"] == 1).unwrap();
    assert!(err["message"].as_str().unwrap().contains("Missing"));
    assert_eq!(err["range"]["start"], json!({"line": 2, "character": 5}));
    assert_eq!(err["range"]["end"], json!({"line": 2, "character": 12}), "the range of the word");
    // Warning for an unused import
    assert!(d.iter().any(|d| d["severity"] == 2 && d["message"].as_str().unwrap().contains("User")));
}

#[test]
fn editing_one_file_updates_diagnostics_of_the_others() {
    let p = project();
    let types = p.uri("types/User.comat");
    let endpoint = p.uri("comatfiles/get_a.comat");
    let mut s = Session::new();
    s.open(&endpoint, "import User from ../types/User.comat\n\ns200 User\n");
    s.open(&types, TYPES);
    // Remove the type (unsaved) → the endpoint gets an error that the imported type does not exist
    s.change(&types, "enum Role { admin, member }\n");
    // Restore it
    s.change(&types, TYPES);
    let (out, _) = s.finish();
    let errors = |uri: &str, msgs: &[&Value]| -> usize {
        msgs.iter()
            .filter(|m| m["params"]["uri"] == json!(uri))
            .map(|m| m["params"]["diagnostics"].as_array().unwrap().iter().filter(|d| d["severity"] == 1).count())
            .sum()
    };
    let published: Vec<&Value> = out.iter().filter(|m| m["method"] == "textDocument/publishDiagnostics").collect();
    assert!(errors(&endpoint, &published) >= 1, "removing the type causes an error in another file");
    assert!(last_diags(&out, &endpoint).unwrap().iter().all(|d| d["severity"] != 1), "it disappears when restored");
}

#[test]
fn files_without_config_get_syntax_diagnostics_only() {
    let dir = std::env::temp_dir().join(format!("comatype-lsp-solo-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let uri = format!("file://{}/x.comat", dir.canonicalize().unwrap().display());
    let mut s = Session::new();
    s.open(&uri, "s200 {\n");
    s.change(&uri, "s200 none\n");
    let (out, _) = s.finish();
    let all: Vec<&Value> = out.iter().filter(|m| m["method"] == "textDocument/publishDiagnostics").collect();
    assert_eq!(all[0]["params"]["diagnostics"].as_array().unwrap().len(), 1);
    assert_eq!(all[1]["params"]["diagnostics"].as_array().unwrap().len(), 0);
    let _ = fs::remove_dir_all(dir);
}

fn loc(v: &Value) -> (String, u64, u64, u64) {
    let r = &v["range"];
    (
        v["uri"].as_str().unwrap().to_string(),
        r["start"]["line"].as_u64().unwrap(),
        r["start"]["character"].as_u64().unwrap(),
        r["end"]["character"].as_u64().unwrap(),
    )
}

#[test]
fn go_to_definition() {
    let p = project();
    let ep = p.uri("comatfiles/get_a.comat");
    let types = p.uri("types/User.comat");
    let text = "import User from ../types/User.comat\n\nbody {\n    me: User,\n    r: Role,\n}\nwrap auth\ns200 User\n";
    let mut s = Session::new();
    s.open(&ep, text);
    let on_ref = s.at("textDocument/definition", &ep, 3, 8); // `User` inside body
    let on_name = s.at("textDocument/definition", &ep, 0, 8); // name in import
    let on_path = s.at("textDocument/definition", &ep, 0, 25); // path in import
    let on_status = s.at("textDocument/definition", &ep, 7, 6); // s200 User
    let on_wrap = s.at("textDocument/definition", &ep, 6, 7); // wrap auth
    let on_builtin = s.at("textDocument/definition", &ep, 3, 4); // Field name (not a declaration)
    let on_unimported = s.at("textDocument/definition", &ep, 4, 8); // Role (not imported)
    let (out, _) = s.finish();

    assert_eq!(loc(&response(&out, on_ref)["result"]), (types.clone(), 1, 0, 4));
    assert_eq!(loc(&response(&out, on_name)["result"]), (types.clone(), 1, 0, 4));
    assert_eq!(loc(&response(&out, on_status)["result"]), (types.clone(), 1, 0, 4));
    let path = &response(&out, on_path)["result"];
    assert_eq!(path["uri"], json!(types));
    assert_eq!(path["range"]["start"], json!({"line": 0, "character": 0}));
    let wrap = loc(&response(&out, on_wrap)["result"]);
    assert_eq!((wrap.0.as_str(), wrap.1, wrap.2, wrap.3), (p.uri("comatfiles/init.comat").as_str(), 0, 8, 12));
    assert!(response(&out, on_builtin)["result"].is_null());
    assert!(response(&out, on_unimported)["result"].is_null(), "a type that is not imported is not found");
}

#[test]
fn definition_works_while_the_file_has_syntax_errors_and_with_utf16_positions() {
    let p = project();
    let ep = p.uri("comatfiles/get_a.comat");
    // 😀 counts as 2 in UTF-16. Points at the `User` after it
    let text = "import User from ../types/User.comat\nbody {\n    a: string(pattern: \"😀\"), b: User,\n    c: \n";
    let mut s = Session::new();
    s.open(&ep, text);
    let line = text.lines().nth(2).unwrap();
    let utf16: u64 = line.chars().take(line.chars().position(|c| c == 'U').unwrap() + 1).map(|c| c.len_utf16() as u64).sum();
    let id = s.at("textDocument/definition", &ep, 2, utf16);
    let (out, _) = s.finish();
    assert_eq!(loc(&response(&out, id)["result"]).1, 1, "the User declaration in types/User.comat (line 1)");
}

#[test]
fn hover_shows_the_declaration_and_builtin_docs() {
    let p = project();
    let ep = p.uri("comatfiles/get_a.comat");
    let text = "import User from ../types/User.comat\n\nbody {\n    id: int64,\n    u: User,\n}\ns404 None\ns200 User\n";
    let mut s = Session::new();
    s.open(&ep, text);
    let user = s.at("textDocument/hover", &ep, 4, 8);
    let int64 = s.at("textDocument/hover", &ep, 3, 8);
    let status = s.at("textDocument/hover", &ep, 7, 2);
    let nothing = s.at("textDocument/hover", &ep, 1, 0);
    let (out, _) = s.finish();
    let md = |id| response(&out, id)["result"]["contents"]["value"].as_str().unwrap_or("").to_string();
    assert!(md(user).contains("nick?: string") && md(user).contains("```comat"), "{}", md(user));
    assert!(md(int64).contains("string"));
    assert!(md(status).contains("200 OK"), "{}", md(status));
    assert!(response(&out, nothing)["result"].is_null());
}

#[test]
fn document_symbols() {
    let p = project();
    let uri = p.uri("types/User.comat");
    let ep = p.uri("comatfiles/get_a.comat");
    let mut s = Session::new();
    s.open(&uri, TYPES);
    s.open(&ep, "import User from ../types/User.comat\npath /a/:id\nparams {\n  id: uuid,\n}\ns200 User\nwrap auth\n");
    let a = s.request("textDocument/documentSymbol", json!({"textDocument": {"uri": uri}}));
    let b = s.request("textDocument/documentSymbol", json!({"textDocument": {"uri": ep}}));
    let (out, _) = s.finish();
    let names =
        |id| response(&out, id)["result"].as_array().unwrap().iter().map(|s| s["name"].as_str().unwrap().to_string()).collect::<Vec<_>>();
    assert_eq!(names(a), vec!["User", "Role"]);
    assert_eq!(response(&out, a)["result"][0]["kind"], 5);
    assert_eq!(response(&out, a)["result"][1]["kind"], 10);
    assert_eq!(names(b), vec!["import User from ../types/User.comat", "path /a/:id", "params", "s200 User", "wrap auth"]);
}

#[test]
fn completion() {
    let p = project();
    let ep = p.uri("comatfiles/get_a.comat");
    let text = "import User from ../types/User.comat\nwrap \nbody {\n    a: \n}\ns\ncookie \n";
    let mut s = Session::new();
    s.open(&ep, text);
    let wrap = s.at("textDocument/completion", &ep, 1, 5);
    let ty = s.at("textDocument/completion", &ep, 3, 7);
    let stmt = s.at("textDocument/completion", &ep, 5, 1);
    let cookie = s.at("textDocument/completion", &ep, 6, 7);
    let (out, _) = s.finish();
    let labels =
        |id| response(&out, id)["result"].as_array().unwrap().iter().map(|s| s["label"].as_str().unwrap().to_string()).collect::<Vec<_>>();
    assert_eq!(labels(wrap), vec!["auth"], "the wrapper in init.comat");
    let ty = labels(ty);
    for want in ["string", "uuidv4", "null", "empty", "User"] {
        assert!(ty.contains(&want.to_string()), "{want} is missing: {ty:?}");
    }
    let stmt = labels(stmt);
    for want in ["import", "params", "body", "s200", "s404", "s418", "s511"] {
        assert!(stmt.contains(&want.to_string()), "{want}");
    }
    assert!(!stmt.contains(&"string".to_string()));
    assert_eq!(labels(cookie), vec!["on", "off"]);
}

#[test]
fn closing_a_document_falls_back_to_the_disk_content() {
    let p = project();
    let uri = p.uri("comatfiles/get_a.comat");
    let mut s = Session::new();
    s.open(&uri, "s200 Missing\n"); // Error in the unsaved content
    s.notify("textDocument/didClose", json!({"textDocument": {"uri": uri}}));
    let (out, _) = s.finish();
    let published: Vec<&Value> =
        out.iter().filter(|m| m["method"] == "textDocument/publishDiagnostics" && m["params"]["uri"] == json!(uri)).collect();
    assert!(published.first().unwrap()["params"]["diagnostics"].as_array().unwrap().iter().any(|d| d["severity"] == 1));
    // After closing, it is checked again with the (valid) content on disk, so the error disappears
    assert!(last_diags(&out, &uri).unwrap().iter().all(|d| d["severity"] != 1));
}

#[test]
fn uri_roundtrip_with_spaces_and_japanese() {
    // Diagnostic uris do not drift even for paths containing spaces and Japanese
    let root = std::env::temp_dir().join(format!("comatype lsp 日本語 {}", std::process::id()));
    fs::create_dir_all(root.join("comatfiles")).unwrap();
    fs::write(root.join("comatype.config.json"), r#"{"services":{"api":{"comatDir":"./comatfiles"}}}"#).unwrap();
    fs::write(root.join("comatfiles/init.comat"), "").unwrap();
    fs::write(root.join("comatfiles/get_a.comat"), "s200 none\n").unwrap();
    let canon = root.canonicalize().unwrap();
    let enc = |p: &Path| -> String {
        let mut s = String::from("file://");
        for b in p.to_string_lossy().bytes() {
            if b.is_ascii_alphanumeric() || b"-._~/".contains(&b) {
                s.push(b as char)
            } else {
                s.push_str(&format!("%{b:02X}"))
            }
        }
        s
    };
    let uri = enc(&canon.join("comatfiles/get_a.comat"));
    let mut s = Session::new();
    s.open(&uri, "s200 Missing\n");
    let (out, _) = s.finish();
    let d = last_diags(&out, &uri).unwrap_or_else(|| {
        panic!("no diagnostics for the same uri: {:?}", out.iter().map(|m| m["params"]["uri"].clone()).collect::<Vec<_>>())
    });
    assert!(d.iter().any(|d| d["severity"] == 1));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn status_codes_come_from_the_registry_and_the_config() {
    let p = project();
    fs::write(
        p.path("comatype.config.json"),
        r#"{"services":{"api":{"comatDir":"./comatfiles"}},"additionalStatusCodes":[{"status":299,"message":"Custom Thing"}]}"#,
    )
    .unwrap();
    let ep = p.uri("comatfiles/get_a.comat");
    let text = "s\ns404\ns299\ns204\ns499 none\n";
    let mut s = Session::new();
    s.open(&ep, text);
    let comp = s.at("textDocument/completion", &ep, 0, 1);
    let h404 = s.at("textDocument/hover", &ep, 1, 2);
    let h299 = s.at("textDocument/hover", &ep, 2, 2);
    let h204 = s.at("textDocument/hover", &ep, 3, 2);
    let h499 = s.at("textDocument/hover", &ep, 4, 2);
    let (out, _) = s.finish();
    let items = response(&out, comp)["result"].as_array().unwrap().clone();
    let labels: Vec<&str> = items.iter().map(|i| i["label"].as_str().unwrap()).collect();
    assert!(labels.contains(&"s299"), "a code added by the config");
    assert!(labels.contains(&"s404") && labels.contains(&"s103") && !labels.contains(&"s306") && !labels.contains(&"s499"));
    assert_eq!(items.iter().find(|i| i["label"] == "s404").unwrap()["detail"], "404 Not Found");
    assert_eq!(items.iter().find(|i| i["label"] == "s204").unwrap()["detail"], "204 No Content (no body)");
    let md = |id| response(&out, id)["result"]["contents"]["value"].as_str().unwrap_or("").to_string();
    assert!(md(h404).contains("404 Not Found") && md(h404).contains("{ message: string }"), "{}", md(h404));
    assert!(md(h299).contains("299 Custom Thing"));
    assert!(md(h204).contains("cannot have a body"));
    assert!(md(h499).contains("undefined"));
}

#[test]
fn undefined_status_codes_are_errors_in_the_editor() {
    let p = project();
    let ep = p.uri("comatfiles/get_a.comat");
    let mut s = Session::new();
    s.open(&ep, "s499 none\ns200 none\n");
    let (out, _) = s.finish();
    let d = last_diags(&out, &ep).unwrap();
    let err = d.iter().find(|d| d["severity"] == 1).unwrap_or_else(|| panic!("{d:?}"));
    assert!(err["message"].as_str().unwrap().contains("499") && err["message"].as_str().unwrap().contains("not defined"));
}

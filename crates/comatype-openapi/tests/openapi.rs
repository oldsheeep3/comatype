use comatype_core::project::check_config;
use comatype_core::status::builtin_table;
use comatype_openapi::{export, import, parse_document, to_yaml};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

static N: AtomicUsize = AtomicUsize::new(0);

fn tmp() -> PathBuf {
    let d = std::env::temp_dir().join(format!("comatype-openapi-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d.canonicalize().unwrap()
}

fn write_project(files: &[(&str, &str)]) -> PathBuf {
    let root = tmp();
    fs::write(root.join("comatype.config.json"), r#"{"services":{"api":{"comatDir":"./comatfiles"}}}"#).unwrap();
    for (p, c) in files {
        let path = root.join(p);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, c).unwrap();
    }
    root
}

fn export_of(files: &[(&str, &str)]) -> Value {
    let root = write_project(files);
    let r = check_config(&root, None);
    let ir = r.ir.unwrap_or_else(|| panic!("{:?}", r.diagnostics));
    let doc = export("api", &ir.services["api"], &builtin_table());
    let _ = fs::remove_dir_all(root);
    doc
}

/// Writes the import result to disk and runs comatype check on it
fn import_and_check(doc: &Value) -> (comatype_openapi::Imported, comatype_core::project::CheckResult, PathBuf) {
    let imported = import(doc, &builtin_table()).unwrap();
    let root = tmp();
    let mut cfg = json!({"services": {"api": {"comatDir": "./comatfiles"}}});
    if !imported.additional_status_codes.is_empty() {
        cfg["additionalStatusCodes"] = imported.additional_status_codes.iter().map(|(c, m)| json!({"status": c, "message": m})).collect();
    }
    fs::write(root.join("comatype.config.json"), cfg.to_string()).unwrap();
    for (rel, content) in &imported.files {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }
    let res = check_config(&root, None);
    (imported, res, root)
}

fn file<'a>(i: &'a comatype_openapi::Imported, rel: &str) -> &'a str {
    &i.files.iter().find(|(p, _)| p == rel).unwrap_or_else(|| panic!("{rel}: {:?}", i.files.iter().map(|f| &f.0).collect::<Vec<_>>())).1
}

const INIT: &str = "baseUrl https://api.example.com\nwrapper auth { ctx { uid: uuid } s401 }\n";

#[test]
fn export_maps_paths_params_bodies_and_responses() {
    let doc = export_of(&[
        ("comatfiles/init.comat", INIT),
        ("comatfiles/defaults.comat", "wrap auth\ncookie on"),
        ("types/U.comat", "enum Role { admin, member }\nU { id: uuidv4, name: string(1..5), role: Role, big: int64, bal?: decimal, at: datetime | null, kind: \"a\" | \"b\", tags: string[], home: { line?: string } }"),
        ("comatfiles/user/put_[id].comat", "import U from ../../types/U.comat\nparams { id: uuidv4 }\nsearch { dry?: bool }\nbody U\ns200 U\ns404\ns204 none"),
        ("comatfiles/query_user.comat", "import U from ../types/U.comat\nbody { name?: string }\ns200 U[]"),
    ]);
    assert_eq!(doc["openapi"], "3.0.3");
    assert_eq!(doc["servers"][0]["url"], "https://api.example.com");

    let put = &doc["paths"]["/user/{id}"]["put"];
    assert_eq!(put["operationId"], "user_put__id");
    assert_eq!(put["tags"], json!(["user"]));
    let params = put["parameters"].as_array().unwrap();
    assert_eq!(
        params[0],
        json!({"name": "id", "in": "path", "required": true, "schema": {"type": "string", "format": "uuid", "x-comatype": "uuidv4"}})
    );
    assert_eq!(params[1]["name"], "dry");
    assert_eq!(params[1]["required"], false);
    assert_eq!(put["requestBody"]["required"], true);
    assert_eq!(put["requestBody"]["content"]["application/json"]["schema"], json!({"$ref": "#/components/schemas/U"}));
    // The description is the status message. The default body is { message: string }; none has no content
    assert_eq!(put["responses"]["404"]["description"], "Not Found");
    assert_eq!(put["responses"]["404"]["content"]["application/json"]["schema"]["properties"]["message"], json!({"type": "string"}));
    assert!(put["responses"]["204"].get("content").is_none());
    assert_eq!(put["responses"]["401"]["description"], "Unauthorized", "the status of the wrapper is included");
    assert_eq!(put["x-comatype-wraps"], json!(["auth"]));

    // QUERY does not exist in 3.0, so it goes in an extension key
    assert!(
        doc["paths"]["/query_user"].get("x-comatype-query").is_some()
            || doc["paths"]["/"].get("x-comatype-query").is_some()
            || doc["paths"].as_object().unwrap().values().any(|p| p.get("x-comatype-query").is_some())
    );

    let u = &doc["components"]["schemas"]["U"];
    assert_eq!(u["required"], json!(["id", "name", "role", "big", "at", "kind", "tags", "home"]));
    assert_eq!(u["properties"]["name"], json!({"type": "string", "minLength": 1, "maxLength": 5}));
    assert_eq!(u["properties"]["role"], json!({"$ref": "#/components/schemas/Role"}));
    assert_eq!(u["properties"]["big"]["x-comatype"], "int64");
    assert_eq!(u["properties"]["at"], json!({"type": "string", "format": "date-time", "nullable": true}));
    assert_eq!(u["properties"]["kind"], json!({"type": "string", "enum": ["a", "b"]}));
    assert_eq!(u["properties"]["tags"], json!({"type": "array", "items": {"type": "string"}}));
    assert_eq!(doc["components"]["schemas"]["Role"], json!({"type": "string", "enum": ["admin", "member"]}));
    // Can be YAML
    assert!(to_yaml(&doc).starts_with("openapi: 3.0.3\n"));
}

const SPEC: &str = r##"
openapi: 3.0.3
info: { title: Pets, version: "1" }
servers: [{ url: "https://pets.example.com/v1" }]
paths:
  /pets:
    get:
      operationId: listPets
      parameters:
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100 } }
        - { name: tag, in: query, required: true, schema: { type: array, items: { type: string } } }
        - { name: X-Trace, in: header, schema: { type: string } }
        - { name: Authorization, in: header, schema: { type: string } }
      responses:
        200:
          description: ok
          headers:
            X-Total: { required: true, schema: { type: integer } }
          content:
            application/json:
              schema: { type: array, items: { $ref: "#/components/schemas/Pet" } }
        "299":
          description: Custom thing
        default:
          description: error
    post:
      requestBody:
        content:
          application/json:
            schema: { $ref: "#/components/schemas/NewPet" }
      responses:
        201: { description: created, content: { application/json: { schema: { $ref: "#/components/schemas/Pet" } } } }
        404:
          description: nf
          content: { application/json: { schema: { type: object, required: [message], properties: { message: { type: string } } } } }
        204: { description: x, content: { application/json: { schema: { type: string } } } }
  /pets/{petId}:
    get:
      parameters: [{ $ref: "#/components/parameters/PetId" }]
      responses:
        200: { $ref: "#/components/responses/PetOk" }
  /pets/{petId}/photos/{photoId}:
    get:
      operationId: getPhoto
      parameters:
        - { name: petId, in: path, required: true, schema: { type: string } }
        - { name: photoId, in: path, required: true, schema: { type: integer } }
      responses:
        200: { description: ok, content: { application/json: { schema: { type: string, format: byte } } } }
    trace: { responses: { 200: { description: x } } }
  /upload:
    put:
      requestBody: { content: { multipart/form-data: { schema: { type: object } } } }
      responses: { 200: { description: ok } }
components:
  parameters:
    PetId: { name: petId, in: path, required: true, schema: { type: string, format: uuid } }
  responses:
    PetOk: { description: ok, content: { application/json: { schema: { $ref: "#/components/schemas/Pet" } } } }
  schemas:
    Id: { type: string, format: uuid }
    Status: { type: string, enum: [available, pending, "not-available"] }
    Kind: { type: string, enum: [cat, dog] }
    Base: { type: object, required: [id], properties: { id: { $ref: "#/components/schemas/Id" } } }
    Pet:
      allOf:
        - $ref: "#/components/schemas/Base"
        - type: object
          required: [name]
          properties:
            name: { type: string, minLength: 1, maxLength: 20 }
            kind: { $ref: "#/components/schemas/Kind" }
            status: { $ref: "#/components/schemas/Status" }
            owner: { type: string, nullable: true }
            weight: { type: number }
            born: { type: [string, "null"], format: date }
            meta: { type: object, additionalProperties: { type: string } }
            either: { oneOf: [{ type: string }, { type: integer }] }
            many: { type: array, items: { oneOf: [{ type: string }, { type: integer }] } }
            nick: { type: string, pattern: "^[a-z]+\\d$" }
    NewPet:
      type: object
      required: [name]
      properties:
        name: { type: string }
        child: { type: object, required: [x], properties: { x: { type: string, x-comatype: int64 } } }
"##;

#[test]
fn import_converts_an_openapi_document_into_a_checkable_project() {
    let doc = parse_document(SPEC).unwrap();
    let (imp, res, root) = import_and_check(&doc);
    let errs: Vec<_> = res.diagnostics.iter().filter(|d| d.is_error()).collect();
    assert!(errs.is_empty(), "{errs:?}\n{:#?}", imp.files);

    assert_eq!(imp.base_url.as_deref(), Some("https://pets.example.com/v1"));
    assert_eq!(file(&imp, "comatfiles/init.comat").trim(), "baseUrl https://pets.example.com/v1");
    assert_eq!(imp.additional_status_codes, vec![(299, "Custom thing".to_string())]);

    // GET /pets: file name, query, headers (Authorization is skipped), response headers
    let list = file(&imp, "comatfiles/get_pets.comat");
    assert!(list.contains("search {\n    limit?: int(1..100),\n    tag: string[],\n}"), "{list}");
    assert!(list.contains("headerReq {\n    \"X-Trace\"?: string,\n}") && !list.contains("Authorization"), "{list}");
    assert!(list.contains("s200 Pet[], {\n    \"X-Total\": int,\n}"), "{list}");
    assert!(list.contains("s299 none"), "{list}");
    // POST: body $ref, default body omitted, codes that cannot have a body are none
    let post = file(&imp, "comatfiles/post_pets.comat");
    assert!(post.contains("body NewPet") && post.contains("s201 Pet\n") && post.contains("s404\n") && post.contains("s204 none"), "{post}");
    // /pets/{petId}: $ref in parameters / responses
    let one = file(&imp, "comatfiles/pets/get_[petId].comat");
    assert!(one.contains("params {\n    petId: uuid,\n}") && one.contains("s200 Pet"), "{one}");
    // A path with a dynamic segment in the middle gets an explicit path, and operationId becomes the file name
    let photo = file(&imp, "comatfiles/get_getPhoto.comat");
    assert!(photo.starts_with("path /pets/:petId/photos/:photoId\n"), "{photo}");
    assert!(photo.contains("photoId: int") && photo.contains("s200 bytes"), "{photo}");

    // Types: allOf is expanded, alias is inlined, enum only when every value can be an identifier
    let pet = file(&imp, "types/Pet.comat");
    assert!(pet.contains("...Base,") && pet.contains("name: string(1..20),"), "{pet}");
    assert!(pet.contains("kind?: Kind,") && pet.contains("status?: \"available\" | \"pending\" | \"not-available\","), "{pet}");
    assert!(pet.contains("owner?: string | null,") && pet.contains("born?: date | null,"), "{pet}");
    assert!(
        pet.contains("weight?: json,")
            && pet.contains("meta?: json,")
            && pet.contains("either?: string | int,")
            && pet.contains("many?: json[],"),
        "{pet}"
    );
    assert!(pet.contains(r#"nick?: string(pattern: "^[a-z]+\\d$"),"#), "{pet}");
    assert!(file(&imp, "types/Kind.comat").contains("enum Kind {\n    cat,\n    dog,\n}"));
    assert!(file(&imp, "types/Base.comat").contains("id: uuid,"), "{}", file(&imp, "types/Base.comat"));
    assert!(imp.files.iter().all(|(p, _)| p != "types/Id.comat"), "alias is inlined");
    assert!(file(&imp, "types/NewPet.comat").contains("child?: {\n        x: int64,\n    },"), "{}", file(&imp, "types/NewPet.comat"));

    // Warnings
    let w = imp.warnings.join("\n");
    for needle in ["default", "number", "additionalProperties", "an array of a union", "trace", "that is not JSON", "204"] {
        assert!(w.contains(needle), "the warnings lack {needle}:\n{w}");
    }
    let _ = fs::remove_dir_all(root);
}

#[test]
fn import_rejects_non_openapi() {
    assert!(import(&json!({"swagger": "2.0"}), &builtin_table()).is_err());
    assert!(parse_document("a: [1,").is_err());
}

fn summary(doc: &Value) -> Vec<(String, String, Vec<String>)> {
    let mut out = Vec::new();
    for (path, item) in doc["paths"].as_object().unwrap() {
        for (m, op) in item.as_object().unwrap() {
            let method = m.strip_prefix("x-comatype-").unwrap_or(m).to_string();
            let mut codes: Vec<String> = op["responses"].as_object().unwrap().keys().cloned().collect();
            codes.sort();
            out.push((path.clone(), method, codes));
        }
    }
    out.sort();
    out
}

#[test]
fn comat_to_openapi_to_comat_round_trip() {
    let files = [
        ("comatfiles/init.comat", INIT),
        ("comatfiles/defaults.comat", "wrap auth\ns500"),
        ("types/U.comat", "enum Role { admin, member }\nU { id: uuidv4, name: string(1..5), role: Role, big: int64, bal?: decimal, at: datetime | null, kind: \"a\" | \"b\", tags: string[], home: { line?: string } }"),
        ("comatfiles/user/put_[id].comat", "import U from ../../types/U.comat\nparams { id: uuidv4 }\nsearch { dry?: bool }\nheaderReq { \"X-Trace\"?: string }\nbody U\ns200 U, { \"X-Version\": string }\ns404\ns204 none"),
        ("comatfiles/get_list.comat", "import U from ../types/U.comat\ns200 U[]"),
        ("comatfiles/post_a.comat", "body { name: string, nick?: string }\ns201 { id: uuid }"),
    ];
    let first = export_of(&files);
    let (imp, res, root) = import_and_check(&first);
    let errs: Vec<_> = res.diagnostics.iter().filter(|d| d.is_error()).collect();
    assert!(errs.is_empty(), "{errs:?}");
    // Exporting to OpenAPI again keeps the path, method and status the same (the wrapper status 401 becomes a normal status here)
    let ir = res.ir.unwrap();
    let second = export("api", &ir.services["api"], &builtin_table());
    assert_eq!(summary(&first), summary(&second));
    // The type shapes are the same too
    for name in ["U", "Role"] {
        assert_eq!(first["components"]["schemas"][name], second["components"]["schemas"][name], "{name}");
    }
    for (path, method) in [("/user/{id}", "put"), ("/list", "get"), ("/a", "post")] {
        let (a, b) = (&first["paths"][path][method], &second["paths"][path][method]);
        assert_eq!(a["parameters"], b["parameters"], "{path}");
        assert_eq!(a["requestBody"], b["requestBody"], "{path}");
        assert_eq!(a["responses"], b["responses"], "{path}");
    }
    let _ = (imp, Path::new(""));
    let _ = fs::remove_dir_all(root);
}

// The client call in every language, as ⟦class|text⟧ segments (k keyword, t name, s string, n number, c comment).
// Used by the animated example on the landing page.
export const clientSnippets: { name: string; code: string }[] = [
  {
    name: 'TypeScript',
    code: "⟦k|import⟧ { c } ⟦k|from⟧ ⟦s|'@comatype/typescript'⟧\n⟦k|import⟧ { path, s200, s404 } ⟦k|from⟧ ⟦s|'@/comatype/user/put__id'⟧\n\n⟦c|// params and body are typed from the .comat⟧\n⟦k|const⟧ res = ⟦k|await⟧ c.⟦t|put⟧(path, { params: { id }, body: user }, s200, s404)\n\n⟦k|if⟧ (res.status === ⟦n|200⟧) res.data   ⟦c|// UserData⟧\n⟦k|if⟧ (res.status === ⟦n|404⟧) res.error  ⟦c|// ApiError⟧\n\n⟦c|// invalid input throws before any request is sent⟧",
  },
  {
    name: 'JavaScript',
    code: "⟦k|import⟧ { c } ⟦k|from⟧ ⟦s|'@comatype/javascript'⟧\n⟦k|import⟧ { path, s200, s404 } ⟦k|from⟧ ⟦s|'./comatype/user/put__id.js'⟧\n\n⟦c|// the .d.ts files give the editor the types⟧\n⟦k|const⟧ res = ⟦k|await⟧ c.⟦t|put⟧(path, { params: { id }, body: user }, s200, s404)\n\n⟦k|if⟧ (res.status === ⟦n|200⟧) res.data   ⟦c|// the user⟧\n⟦k|if⟧ (res.status === ⟦n|404⟧) res.error  ⟦c|// ApiError⟧",
  },
  {
    name: 'Go',
    code: 'res, err := c.⟦t|Put⟧(ctx, user_put_id.Endpoint, user_put_id.Request{\n    Params: user_put_id.Params{ID: comatype.Uuidv4(id)},\n    Body:   userInput,\n})\n⟦k|if⟧ err != ⟦k|nil⟧ {\n    ⟦k|return⟧ err\n}\n\n⟦k|switch⟧ res.Status {\n⟦k|case⟧ ⟦n|200⟧:\n    _ = res.S200 ⟦c|// UserData⟧\n⟦k|case⟧ ⟦n|404⟧:\n    _ = res.S404 ⟦c|// ApiError⟧\n}',
  },
  {
    name: 'Python',
    code: '⟦k|from⟧ comatype ⟦k|import⟧ c\n⟦k|from⟧ comatype_gen.user.put__id ⟦k|import⟧ path, S200, S404, Request, Params\n\nres = ⟦k|await⟧ c.⟦t|put⟧(path, Request(params=Params(id=UUID(id)), body=user), S200, S404)\n\n⟦k|match⟧ res.status:\n    ⟦k|case⟧ ⟦n|200⟧:\n        res.data  ⟦c|# UserData⟧\n    ⟦k|case⟧ ⟦n|404⟧:\n        res.error  ⟦c|# ApiError⟧',
  },
  {
    name: 'Rust',
    code: '⟦k|use⟧ comatype::c;\n⟦k|use⟧ crate::comatype_gen::user_put_id::{self, Request, Response};\n\n⟦k|let⟧ res = c::⟦t|put⟧(\n    &user_put_id::ENDPOINT,\n    Request { params: user_put_id::Params { id: id.into() }, body: user, ..Default::default() },\n)?;\n\n⟦c|// res: Response, the declared statuses (S200 | S404)⟧',
  },
  {
    name: 'Java',
    code: '⟦t|UserPutId.Response⟧ res = C.⟦t|put⟧(UserPutId.ENDPOINT,\n        ⟦k|new⟧ UserPutId.Request(⟦k|new⟧ UserPutId.Params(id), UserPutId.RequestHeaders.empty(), user));\n\n⟦k|if⟧ (res ⟦k|instanceof⟧ UserPutId.S200 ok) {\n    ⟦t|Types.UserData⟧ data = ok.body();\n} ⟦k|else if⟧ (res ⟦k|instanceof⟧ UserPutId.S404 notFound) {\n    ⟦t|Types.ApiError⟧ error = notFound.body();\n}',
  },
  {
    name: 'Kotlin',
    code: '⟦k|val⟧ res = CK.⟦t|put⟧(UserPutId.ENDPOINT, UserPutId.Request(params = UserPutId.Params(id), body = user))\n\n⟦k|when⟧ (res) {\n    ⟦k|is⟧ UserPutId.S200 -> res.body ⟦c|// UserData⟧\n    ⟦k|is⟧ UserPutId.S404 -> res.body ⟦c|// ApiError⟧\n    ⟦k|else⟧ -> {}\n}',
  },
  {
    name: 'Swift',
    code: '⟦k|let⟧ res = ⟦k|try await⟧ C.⟦t|put⟧(UserPutId.endpoint, UserPutId.Request(params: .init(id: id), body: user))\n\n⟦k|switch⟧ res {\n⟦k|case⟧ .s200(⟦k|let⟧ data, _): _ = data   ⟦c|// UserData⟧\n⟦k|case⟧ .s404(⟦k|let⟧ error, _): _ = error ⟦c|// ApiError⟧\n⟦k|default⟧: ⟦k|break⟧\n}',
  },
  {
    name: 'Ruby',
    code: '⟦k|require⟧ ⟦s|"comatype"⟧\n⟦k|require_relative⟧ ⟦s|"comatype_gen/all"⟧\n\nres = Comatype::C.⟦t|put⟧(UserPutId::ENDPOINT, params: { id: id }, body: user)\n\n⟦k|case⟧ res\n⟦k|when⟧ UserPutId::S200 ⟦k|then⟧ res.body ⟦c|# UserData⟧\n⟦k|when⟧ UserPutId::S404 ⟦k|then⟧ res.body ⟦c|# ApiError⟧\n⟦k|end⟧',
  },
  {
    name: 'C#',
    code: '⟦t|UserPutId.Response⟧ res = ⟦k|await⟧ C.⟦t|PutAsync⟧(\n    UserPutId.Endpoint,\n    ⟦k|new⟧ UserPutId.Request(⟦k|new⟧ UserPutId.Params(id), UserPutId.RequestHeaders.Empty(), user)\n);\n\n⟦k|switch⟧ (res)\n{\n    ⟦k|case⟧ UserPutId.S200 ok:\n        ⟦t|Types.UserData⟧ data = ok.Body;\n        ⟦k|break⟧;\n    ⟦k|case⟧ UserPutId.S404 notFound:\n        ⟦t|Types.ApiError⟧ error = notFound.Body;\n        ⟦k|break⟧;\n}',
  },
]

export interface Token {
  c: string
  t: string
}

export function tokenize(code: string): Token[] {
  const out: Token[] = []
  const re = /⟦([kstcn])\|([^⟧]*)⟧/g
  let last = 0
  let m: RegExpExecArray | null = re.exec(code)
  while (m !== null) {
    if (m.index > last) out.push({ c: '', t: code.slice(last, m.index) })
    out.push({ c: m[1], t: m[2] })
    last = re.lastIndex
    m = re.exec(code)
  }
  if (last < code.length) out.push({ c: '', t: code.slice(last) })
  return out
}

/** Logo file of each language (SVG paths from Simple Icons, in public/lang, in the brand colors). */
export const langLogo: Record<string, string> = {
  TypeScript: 'typescript',
  JavaScript: 'javascript',
  Go: 'go',
  Python: 'python',
  Rust: 'rust',
  Java: 'java',
  Kotlin: 'kotlin',
  Swift: 'swift',
  Ruby: 'ruby',
  'C#': 'csharp',
}

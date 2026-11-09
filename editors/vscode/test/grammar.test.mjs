import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { scopeOf, tokenize } from './helpers.mjs'

const usage = fileURLToPath(new URL('../../../usage', import.meta.url))

/** 期待するスコープ: [ソース 1 行, トークン, スコープ, （同じトークンの何番目か）] */
const cases = [
  // Comment
  ['// コメント path /x', '// コメント path /x', 'comment.line.double-slash.comat'],
  // import (the path is a raw value to the end of the line)
  ['import UserData, ApiError from ../types/common.comat', 'import', 'keyword.control.import.comat'],
  ['import UserData, ApiError from ../types/common.comat', 'UserData', 'entity.name.type.comat'],
  ['import UserData, ApiError from ../types/common.comat', 'from', 'keyword.control.from.comat'],
  ['import UserData from ../types/common.comat', '../types/common.comat', 'string.unquoted.path.comat'],
  // path: fixed, relative, dynamic
  ['path /user/:id', 'path', 'keyword.other.path.comat'],
  ['path /user/:id', '/user/', 'string.unquoted.path.comat'],
  ['path /user/:id', ':id', 'variable.parameter.path.comat'],
  ["path './me'", "'./me'", 'string.unquoted.path.comat'],
  // baseUrl (`//` in it does not make a comment)
  ['baseUrl https://api.example.com', 'https://api.example.com', 'string.unquoted.url.comat'],
  // wrap / cookie
  ['wrap auth', 'wrap', 'keyword.other.wrap.comat'],
  ['wrap auth', 'auth', 'entity.name.function.wrapper.comat'],
  ['wrap auth off', 'off', 'constant.language.switch.comat'],
  ['cookie on', 'on', 'constant.language.switch.comat'],
  ['cache 5000', '5000', 'constant.numeric.comat'],
  ['cache 5000 cookie', 'cookie', 'constant.language.switch.comat'],
  ['cache off', 'off', 'constant.language.switch.comat'],
  ['cookie session {', 'session', 'entity.name.cookie.comat'],
  ['wrapper auth {', 'wrapper', 'keyword.other.wrapper.comat'],
  // Block and status
  ['params {', 'params', 'keyword.other.block.comat'],
  ['headerRes {', 'headerRes', 'keyword.other.block.comat'],
  ['body UserData', 'body', 'keyword.other.block.comat'],
  ['body UserData', 'UserData', 'entity.name.type.comat'],
  ['s404 ApiError', 's404', 'support.constant.status.comat'],
  ['s200 none, {', 'none', 'constant.language.comat'],
  // Type declaration and enum
  ['UserData {', 'UserData', 'entity.name.type.class.comat'],
  ['enum Role {', 'enum', 'storage.type.enum.comat'],
  ['enum Role {', 'Role', 'entity.name.type.enum.comat'],
  // Fields (`?`, quoted names, names that are the same as reserved words)
  ['    name?: string,', 'name', 'variable.other.property.comat'],
  ['    name?: string,', '?', 'keyword.operator.optional.comat'],
  ['    name?: string,', 'string', 'support.type.builtin.comat'],
  ['    "X-Request-Id"?: uuid,', 'X-Request-Id', 'variable.other.property.comat'],
  ['    body: string,', 'body', 'variable.other.property.comat'],
  ['    s200: int,', 's200', 'variable.other.property.comat'],
  ['    path: string,', 'path', 'variable.other.property.comat'],
  // Type expressions
  ['    uid: empty,', 'empty', 'constant.language.comat'],
  ['    ...UserData,', '...', 'keyword.operator.spread.comat'],
  ['    ...UserData,', 'UserData', 'entity.name.type.comat'],
  ['    tags: string[],', '[]', 'storage.modifier.array.comat'],
  ['    at: datetime | null,', '|', 'keyword.operator.union.comat'],
  ['    at: datetime | null,', 'null', 'constant.language.comat'],
  ['    role: Role,', 'Role', 'entity.name.type.comat'],
  ['    status: "active" | "banned",', 'active', 'string.quoted.double.comat'],
  // Constraints
  ['    nickname: string(1..50),', '1', 'constant.numeric.integer.comat'],
  ['    nickname: string(1..50),', '..', 'keyword.operator.range.comat'],
  ['    age: int(..150),', '150', 'constant.numeric.integer.comat'],
  ['    zip: string(pattern: "^[0-9]{3}$"),', 'pattern', 'variable.other.property.comat'],
  ['    zip: string(pattern: "^[0-9]{3}$"),', '^[0-9]{3}$', 'string.quoted.double.comat'],
  // cookie settings
  ['    httpOnly: true,', 'true', 'constant.language.boolean.comat'],
  ['    sameSite: lax,', 'lax', 'constant.language.option.comat'],
]

for (const [src, token, scope, nth] of cases) {
  test(`${JSON.stringify(src.trim())} の ${JSON.stringify(token)} は ${scope}`, () => {
    const actual = scopeOf(src, token, nth)
    assert.ok(actual, `トークン ${JSON.stringify(token)} が見つかりません: ${JSON.stringify(tokenize(src)[0].map((t) => t.text))}`)
    assert.equal(actual, scope)
  })
}

test('コメントの中は何も強調しない（キーワードやパスも）', () => {
  const toks = tokenize('// import X from ./a s200 { }')[0]
  assert.equal(toks.length, 1)
})

test('文字列の中の // はコメントにならない', () => {
  const toks = tokenize('    zip: string(pattern: "a//b"),')[0]
  assert.ok(toks.every((t) => !t.scopes.some((s) => s.startsWith('comment'))))
})

test('enum の値は複数行でも強調される。閉じたあとは通常に戻る', () => {
  const lines = tokenize('enum Role {\n  admin, // 管理者\n  member,\n}\nProfile {\n}')
  assert.equal(lines[1][1]?.scopes.at(-1) ?? lines[1][0].scopes.at(-1), 'variable.other.enummember.comat')
  assert.equal(lines[2].find((t) => t.text === 'member')?.scopes.at(-1), 'variable.other.enummember.comat')
  assert.ok(lines[1].some((t) => t.scopes.at(-1) === 'comment.line.double-slash.comat'))
  assert.equal(lines[4].find((t) => t.text === 'Profile')?.scopes.at(-1), 'entity.name.type.class.comat')
})

function* comatFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* comatFiles(p)
    else if (name.endsWith('.comat')) yield p
  }
}

test('usage の .comat は、すべてのトークンにスコープが付く（強調されない文字が無い）', () => {
  const files = [...comatFiles(usage)]
  assert.ok(files.length >= 15, `.comat が見つかりません: ${files.length}`)
  const bad = []
  for (const f of files) {
    tokenize(readFileSync(f, 'utf8')).forEach((toks, i) => {
      for (const t of toks) {
        if (t.text.trim() !== '' && t.scopes.length === 1) bad.push(`${f.replace(usage, 'usage')}:${i + 1} ${JSON.stringify(t.text)}`)
      }
    })
  }
  assert.deepEqual(bad, [])
})

test('usage の .comat に、不正を示すスコープが付かない', () => {
  for (const f of comatFiles(usage)) {
    for (const toks of tokenize(readFileSync(f, 'utf8'))) {
      for (const t of toks) assert.ok(!t.scopes.some((s) => s.startsWith('invalid')), `${f}: ${t.text}`)
    }
  }
})

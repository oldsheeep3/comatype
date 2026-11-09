// The Playground's small check (lint.ts), loaded as TypeScript through Node's type stripping

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { lintComat } from '../lib/lint.ts'

const statuses = JSON.parse(readFileSync(new URL('../data/status-codes.json', import.meta.url), 'utf8'))
const lint = (text) => lintComat(text, statuses, 'ja-jp')

test('English messages (the default locale)', () => {
  const p = lintComat('s200 none\ns499 none\nUser {\n', statuses)
  assert.ok(p[0].message.startsWith('Status code 499 is not defined'))
  assert.equal(p[1].message, 'Missing }')
})

test('正しいものには、問題が無い', () => {
  assert.deepEqual(lint('s200 User\ns404\ns204 none\ns204\nUser {\n    a: string(1..5),\n}\n'), [])
  assert.deepEqual(lint('// コメントの中の { や s999 は見ない\ns200 none'), [])
  assert.deepEqual(lint('Profile {\n    zip: string(pattern: "^[{(]$"),\n}\n'), [])
})

test('括弧の対応', () => {
  const a = lint('User {\n    a: string,\n')
  assert.equal(a.length, 1)
  assert.deepEqual([a[0].line, a[0].column, a[0].message], [1, 6, '} が足りません'])
  const b = lint('User {\n}\n}\n')
  assert.deepEqual([b[0].line, b[0].message], [3, '対応する { がありません'])
  const c = lint('a: string(1..5}\n')
  assert.ok(c.length >= 1)
})

test('登録の無いステータスコードはエラー', () => {
  const p = lint('s200 none\ns499 none\n  s306\n')
  assert.deepEqual(
    p.map((x) => x.line),
    [2, 3],
  )
  assert.ok(p[0].message.startsWith('ステータスコード 499 は未定義です') && p[1].message.startsWith('ステータスコード 306 は未定義です'))
})

test('本文を持てないコードに、型を書くとエラー', () => {
  assert.equal(lint('s204 User').length, 1)
  assert.match(lint('s304 { message: string }')[0].message, /ボディを持てません/)
  assert.deepEqual(lint('s204 none, {\n    X: string,\n}\n'), [])
  assert.deepEqual(lint('s204, {\n    X: string,\n}\n'), [])
  assert.equal(lint('s404 User').length, 0)
})

test('フィールド名が s404 でも、ステータスとは見なさない', () => {
  assert.deepEqual(lint('Foo {\n    s999: int,\n}\n'), [])
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { t, ValidationError, defineStatus } from '../src/index.ts'

test('object: 必須・省略・余分なキー', () => {
  const s = t.object<{ a: string; b?: number }>({ a: t.string(), b: t.opt(t.int()) })
  assert.deepEqual(s.parse({ a: 'x', extra: 1 }), { a: 'x' })
  assert.deepEqual(s.parse({ a: 'x', b: 2 }), { a: 'x', b: 2 })
  assert.throws(() => s.parse({ b: 2 }), (e: unknown) => e instanceof ValidationError && e.path === 'a')
})

test('制約', () => {
  assert.throws(() => t.string({ min: 1, max: 3 }).parse('abcd'))
  assert.throws(() => t.string({ pattern: '^[0-9]+$' }).parse('a1'))
  assert.equal(t.string({ pattern: '^[0-9]+$' }).parse('12'), '12')
  assert.throws(() => t.int({ min: 0, max: 150 }).parse(151))
  assert.throws(() => t.int().parse(1.5))
})

test('uuid のバージョン', () => {
  const v4 = '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10'
  const v7 = '01890a5d-ac96-774b-bcce-b302099a8057'
  assert.equal(t.uuidv4().parse(v4), v4)
  assert.throws(() => t.uuidv4().parse(v7))
  assert.equal(t.uuidv7().parse(v7), v7)
  assert.equal(t.uuid().parse(v4), v4)
})

test('日付と時刻', () => {
  assert.equal(t.date().parse('2024-02-29'), '2024-02-29')
  assert.throws(() => t.date().parse('2023-02-29'))
  assert.equal(t.datetime().parse('2024-01-02T03:04:05+09:00'), '2024-01-02T03:04:05+09:00')
  assert.throws(() => t.datetime().parse('2024-01-02'))
  assert.throws(() => t.time().parse('24:00:00'))
})

test('int64 は文字列 <-> bigint', () => {
  const s = t.int64()
  assert.equal(s.parse('9007199254740993'), 9007199254740993n)
  assert.equal(s.encode(9007199254740993n), '9007199254740993')
  assert.throws(() => s.parse(12))
})

test('bytes と url', () => {
  const b = t.bytes()
  assert.deepEqual([...b.parse('aGk=')], [104, 105])
  assert.equal(b.encode(new Uint8Array([104, 105])), 'aGk=')
  assert.equal(t.url().parse('https://example.com/a').hostname, 'example.com')
})

test('union / null / array / enum / lazy', () => {
  const u = t.union(t.string(), t.null())
  assert.equal(u.parse(null), null)
  assert.throws(() => u.parse(1))
  assert.deepEqual(t.array(t.enum(['a', 'b'])).parse(['a']), ['a'])
  assert.throws(() => t.enum(['a']).parse('c'))
  type Tree = { children: Tree[] }
  const tree: ReturnType<typeof t.object<Tree>> = t.object<Tree>({ children: t.array(t.lazy(() => tree)) })
  assert.deepEqual(tree.parse({ children: [{ children: [] }] }), { children: [{ children: [] }] })
})

test('defineStatus: 2xx は data、それ以外は error', () => {
  const s200 = defineStatus<{ status: 200; data: string }, { data: string }>(200, t.string())
  const s404 = defineStatus<{ status: 404; error: string }, { error: string }>(404, t.string())
  const s204 = defineStatus<{ status: 204 }>(204, null)
  assert.deepEqual(s200({ data: 'x' }), { status: 200, data: 'x' })
  assert.deepEqual(s404({ error: 'no' }), { status: 404, error: 'no' })
  assert.deepEqual(s204(), { status: 204 })
  assert.equal(s200.kind, 'data')
  assert.equal(s404.kind, 'error')
})

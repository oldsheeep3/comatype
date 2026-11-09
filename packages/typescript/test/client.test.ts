import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import {
  ComatypeError,
  type ComatypeWrap,
  c,
  defineEndpoint,
  defineStatus,
  t,
  UnexpectedStatusError,
  ValidationError,
} from '../src/index.ts'

// ---- test server: records received requests and returns canned responses ----
interface Seen {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
  body: unknown
}
let seen: Seen[] = []
let reply: (s: Seen) => { status: number; body?: unknown; headers?: Record<string, string> } = () => ({ status: 200 })
let server: http.Server
let base = ''

before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (d) => (raw += d))
    req.on('end', () => {
      const s: Seen = { method: req.method!, url: req.url!, headers: req.headers, body: raw ? JSON.parse(raw) : undefined }
      seen.push(s)
      const r = reply(s)
      res.writeHead(r.status, { 'content-type': 'application/json', ...r.headers })
      res.end(r.body === undefined ? '' : JSON.stringify(r.body))
    })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => server.close())
beforeEach(() => {
  seen = []
  reply = () => ({ status: 200 })
  c.init({ baseUrl: base } as any)
})

// ---- endpoints shaped like generated code ----
const ID = '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10'
type User = { name: string; followers: bigint; tags?: string[] }
const User = t.object<User>({ name: t.string(), followers: t.int64(), tags: t.opt(t.array(t.string())) })
const ApiError = t.object<{ code: string }>({ code: t.string() })

const s200 = defineStatus<{ status: 200; data: User; headers?: { 'X-Count'?: number; Allow?: string[] } }, any>(
  200,
  User,
  t.object({ 'X-Count': t.opt(t.int()), Allow: t.opt(t.array(t.string())) }),
)
const s404 = defineStatus<{ status: 404; error: { code: string } }, any>(404, ApiError)
const s401 = defineStatus<{ status: 401; error: { code: string } }, { error: { code: string } }>(401, ApiError)

const put = defineEndpoint<any, any>({
  method: 'put',
  path: '/user/:id',
  module: 'user/put__id',
  wraps: [],
  cookie: false,
  params: t.object({ id: t.uuidv4() }),
  search: t.object({ verbose: t.opt(t.bool()), tag: t.opt(t.array(t.string())) }),
  body: User,
  requestHeaders: t.object({ 'X-Request-Id': t.opt(t.uuid()) }),
  responses: [s200, s404],
})

test('params / search / body / headers が送られ、レスポンスが検証・変換される', async () => {
  reply = () => ({ status: 200, body: { name: 'a', followers: '9007199254740993' }, headers: { 'X-Count': '3', Allow: 'GET, PUT' } })
  const res = await (c.put as any)(
    put,
    {
      params: { id: ID },
      search: { verbose: true, tag: ['x', 'y z'] },
      body: { name: 'a', followers: 9007199254740993n },
      headers: { 'X-Request-Id': ID },
    },
    s200,
    s404,
  )
  assert.equal(seen.length, 1)
  assert.equal(seen[0].method, 'PUT')
  assert.equal(seen[0].url, `/user/${ID}?verbose=true&tag=x&tag=y+z`)
  assert.deepEqual(seen[0].body, { name: 'a', followers: '9007199254740993' }) // bigint is sent as a string
  assert.equal(seen[0].headers['x-request-id'], ID)
  assert.equal(seen[0].headers['content-type'], 'application/json')
  assert.equal(res.status, 200)
  assert.equal(res.data.followers, 9007199254740993n) // converted from string back to bigint
  assert.deepEqual(res.headers, { 'X-Count': 3, Allow: ['GET', 'PUT'] }) // headers are converted to int / array
})

test('2xx 以外は error に入る', async () => {
  reply = () => ({ status: 404, body: { code: 'not_found' } })
  const res = await (c.put as any)(put, { params: { id: ID }, body: { name: 'a', followers: 1n } }, s200, s404)
  assert.equal(res.status, 404)
  assert.deepEqual(res.error, { code: 'not_found' })
  assert.equal(res.data, undefined)
})

test('渡していないステータスは UnexpectedStatusError', async () => {
  reply = () => ({ status: 500, body: { code: 'boom' } })
  await assert.rejects(
    (c.put as any)(put, { params: { id: ID }, body: { name: 'a', followers: 1n } }, s200, s404),
    (e: unknown) => e instanceof UnexpectedStatusError && e.status === 500,
  )
})

test('壊れたレスポンスは ValidationError', async () => {
  reply = () => ({ status: 200, body: { name: 1 } })
  await assert.rejects(
    (c.put as any)(put, { params: { id: ID }, body: { name: 'a', followers: 1n } }, s200),
    (e: unknown) => e instanceof ValidationError && e.path === 'data.name',
  )
})

test('送る前に検証し、不正ならリクエストしない', async () => {
  await assert.rejects(
    (c.put as any)(put, { params: { id: 'not-uuid' }, body: { name: 'a', followers: 1n } }, s200),
    (e: unknown) => e instanceof ValidationError && e.path === 'id',
  )
  await assert.rejects(
    (c.put as any)(put, { params: { id: ID }, body: { followers: 1n } }, s200),
    (e: unknown) => e instanceof ValidationError,
  )
  assert.equal(seen.length, 0)
})

test('メソッドが違うエンドポイントは渡せない', async () => {
  await assert.rejects((c.get as any)(put, s200), (e: unknown) => e instanceof ComatypeError)
})

// ---- wrappers ----
const get = defineEndpoint<any, any>({
  method: 'get',
  path: '/me',
  module: 'me',
  wraps: ['outer', 'inner'],
  cookie: false,
  params: null,
  search: null,
  body: null,
  requestHeaders: null,
  responses: [s200],
})
const OK = { name: 'a', followers: '1' }

test('ラッパーは外側から内側の順に動き、リクエストとレスポンスを書き換えられる', async () => {
  const log: string[] = []
  const outer: ComatypeWrap = async (req, next) => {
    log.push('outer in')
    const res = await next({ ...req, headers: { ...req.headers, 'x-order': 'outer' } })
    log.push('outer out')
    return res
  }
  const inner: ComatypeWrap = async (req, next) => {
    log.push('inner in')
    const res = await next({ ...req, headers: { ...req.headers, 'x-order': `${req.headers['x-order']},inner` } })
    log.push('inner out')
    return res
  }
  reply = () => ({ status: 200, body: OK })
  c.init({ baseUrl: base, wrappers: { outer, inner } } as any)
  await (c.get as any)(get, s200)
  assert.deepEqual(log, ['outer in', 'inner in', 'inner out', 'outer out'])
  assert.equal(seen[0].headers['x-order'], 'outer,inner')
})

test('ラッパーが s401() を返すと、通信せずにそのまま返る', async () => {
  const guard: ComatypeWrap = async () => s401({ error: { code: 'login' } }) as any
  c.init({ baseUrl: base, wrappers: { outer: guard, inner: guard } } as any)
  const res = await (c.get as any)(get, s200)
  assert.deepEqual(res, { status: 401, error: { code: 'login' } })
  assert.equal(seen.length, 0)
})

test('ラッパーが足りなければ通信前にエラー', async () => {
  const pass: ComatypeWrap = async (r, n) => n(r)
  c.init({ baseUrl: base, wrappers: { outer: pass } } as any)
  await assert.rejects((c.get as any)(get, s200), (e: unknown) => e instanceof ComatypeError && /inner/.test(String(e)))
  assert.equal(seen.length, 0)
})

// ---- settings ----
const plain = defineEndpoint<any, any>({
  method: 'get',
  path: '/p',
  module: 'p',
  baseUrl: 'http://127.0.0.1:1', // an unreachable value (stands in for baseUrl from init.comat)
  wraps: [],
  cookie: true,
  params: null,
  search: null,
  body: null,
  requestHeaders: null,
  responses: [s200],
})

test('base url の優先順位: init > 環境変数 > init.comat の baseUrl', async () => {
  reply = () => ({ status: 200, body: OK })
  await (c.get as any)(plain, s200) // baseUrl from init
  assert.equal(seen.length, 1)

  c.init({} as any)
  await assert.rejects((c.get as any)(plain, s200)) // ep.baseUrl (unreachable)
  process.env.COMATYPE_BASE_URL = base
  try {
    await (c.get as any)(plain, s200) // environment variable
    assert.equal(seen.length, 2)
  } finally {
    delete process.env.COMATYPE_BASE_URL
  }
})

test('with: ヘッダを足した別のクライアント。元のクライアントには影響しない', async () => {
  reply = () => ({ status: 200, body: OK })
  c.init({ baseUrl: base, headers: { 'x-a': '1' } } as any)
  await (c.with({ headers: { 'x-b': '2' } }).get as any)(plain, s200)
  await (c.get as any)(plain, s200)
  assert.equal(seen[0].headers['x-a'], '1')
  assert.equal(seen[0].headers['x-b'], '2')
  assert.equal(seen[1].headers['x-b'], undefined)
})

test('cookie on のエンドポイントには credentials を渡す', async () => {
  let credentials: unknown = 'unset'
  const f: typeof fetch = (url, init) => {
    credentials = init?.credentials
    return fetch(url, init)
  }
  reply = () => ({ status: 200, body: OK })
  c.init({ baseUrl: base, cookie: { credentials: 'include' }, fetch: f } as any)
  await (c.get as any)(plain, s200)
  assert.equal(credentials, 'include')
})

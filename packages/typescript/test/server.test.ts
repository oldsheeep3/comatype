import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, defineEndpoint, defineStatus, t, ComatypeError, type ComatypeWrap } from '../src/index.ts'
import { serve } from '../src/node.ts'
import { createClient } from '../src/index.ts'

const ID = '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10'
type User = { name: string; followers: bigint }
const User = t.object<User>({ name: t.string(), followers: t.int64() })
const ApiError = t.object<{ code: string }>({ code: t.string() })

const s200 = defineStatus<any, { data?: any; error?: any; headers?: any }>(200, User, t.object({ 'X-Count': t.opt(t.int()), Allow: t.opt(t.array(t.string())) }))
const s204 = defineStatus<any, { data?: any; error?: any; headers?: any }>(204, null)
const s404 = defineStatus<any, { data?: any; error?: any; headers?: any }>(404, ApiError)
const s401 = defineStatus<any, { data?: any; error?: any; headers?: any }>(401, ApiError)

const ep = (over: Record<string, unknown>): any =>
  defineEndpoint<any, any, any>({
    method: 'get',
    path: '/x',
    module: 'x',
    wraps: [],
    cookie: false,
    params: null,
    search: null,
    body: null,
    requestHeaders: null,
    responses: [s200, s204, s404, s401],
    ...over,
  })

const put = ep({
  method: 'put',
  path: '/user/:id',
  params: t.object({ id: t.uuidv4() }),
  search: t.object({ verbose: t.opt(t.bool()), limit: t.opt(t.int()), tag: t.opt(t.array(t.string())) }),
  body: User,
  requestHeaders: t.object({ 'X-Request-Id': t.opt(t.uuid()), 'X-N': t.opt(t.int()) }),
})

let s = createServer()
beforeEach(() => {
  s = createServer()
})

const req = (method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request(`http://test${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

test('params / search / body / headers が検証・変換されてハンドラに届く', async () => {
  let got: any
  s.put(put, (r: any) => {
    got = r
    return s200({ data: r.body, headers: { 'X-Count': 2, Allow: ['GET', 'PUT'] } })
  })
  const res = await s.handle(
    req('PUT', `/user/${ID}?verbose=true&limit=5&tag=a&tag=b`, {
      body: { name: 'a', followers: '9007199254740993' },
      headers: { 'x-n': '7', 'x-request-id': ID, cookie: 'session=abc%20d; other=1' },
    }),
  )
  assert.equal(res.status, 200)
  assert.equal(got.params.id, ID)
  assert.deepEqual(got.search, { verbose: true, limit: 5, tag: ['a', 'b'] })
  assert.equal(got.body.followers, 9007199254740993n) // from string to bigint
  assert.equal(got.headers['X-N'], 7)
  assert.equal(got.cookies.session, 'abc d')
  assert.deepEqual(await res.json(), { name: 'a', followers: '9007199254740993' }) // bigint is returned as a string
  assert.equal(res.headers.get('x-count'), '2')
  assert.equal(res.headers.get('allow'), 'GET, PUT') // arrays are joined with ", "
  assert.equal(res.headers.get('content-type'), 'application/json')
})

test('検証エラーは 400', async () => {
  let called = false
  s.put(put, () => {
    called = true
    return s204()
  })
  const bad = [
    req('PUT', '/user/not-uuid', { body: { name: 'a', followers: '1' } }),
    req('PUT', `/user/${ID}`, { body: { followers: '1' } }),
    req('PUT', `/user/${ID}?limit=abc`, { body: { name: 'a', followers: '1' } }),
    req('PUT', `/user/${ID}`),
  ]
  for (const r of bad) {
    const res = await s.handle(r)
    assert.equal(res.status, 400)
    assert.equal((await res.json()).code, 'validation_error')
  }
  const res = await s.handle(new Request(`http://test/user/${ID}`, { method: 'PUT', body: '{oops', headers: { 'content-type': 'application/json' } }))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).code, 'invalid_json')
  assert.equal(called, false)
})

test('2xx 以外は error、ボディなしは本文なし', async () => {
  s.get(ep({ path: '/a' }), () => s404({ error: { code: 'nf' } }))
  s.get(ep({ path: '/b' }), () => s204())
  const a = await s.handle(req('GET', '/a'))
  assert.equal(a.status, 404)
  assert.deepEqual(await a.json(), { code: 'nf' })
  const b = await s.handle(req('GET', '/b'))
  assert.equal(b.status, 204)
  assert.equal(await b.text(), '')
})

test('ルーティング: 404 / 405 / 静的なセグメントが動的より優先', async () => {
  s.get(ep({ path: '/user/:id', params: t.object({ id: t.string() }) }), (r: any) => s404({ error: { code: `id:${r.params.id}` } }))
  s.get(ep({ path: '/user/me' }), () => s404({ error: { code: 'me' } }))
  s.post(ep({ method: 'post', path: '/user/me' }), () => s204())
  assert.equal((await (await s.handle(req('GET', '/user/me'))).json()).code, 'me')
  assert.equal((await (await s.handle(req('GET', '/user/a%2Fb'))).json()).code, 'id:a/b')
  assert.equal((await s.handle(req('GET', '/none'))).status, 404)
  const m = await s.handle(req('DELETE', '/user/me'))
  assert.equal(m.status, 405)
  assert.equal(m.headers.get('allow'), 'GET, POST')
  assert.equal((await (await s.handle(req('GET', '/user/me/'))).json()).code, 'me') // trailing / is ignored
})

test('同じルートの二重登録・メソッド違いは登録時にエラー', () => {
  s.get(ep({ path: '/dup' }), () => s204())
  assert.throws(() => s.get(ep({ path: '/dup' }), () => s204()), ComatypeError)
  assert.throws(() => s.post(ep({ path: '/other' }), () => s204()), ComatypeError)
})

test('ハンドラが .comat に合わないレスポンスを返すと 500（中身は見せない）', async () => {
  const errors: unknown[] = []
  s.init({ onError: (e: unknown) => errors.push(e) } as any)
  s.get(ep({ path: '/bad' }), () => s200({ data: { name: 1 } }))
  s.get(ep({ path: '/undeclared' }), () => ({ status: 418 }))
  s.get(ep({ path: '/throws' }), () => {
    throw new Error('secret')
  })
  for (const p of ['/bad', '/undeclared', '/throws']) {
    const res = await s.handle(req('GET', p))
    assert.equal(res.status, 500)
    assert.deepEqual(await res.json(), { code: 'internal_error', message: 'Internal Server Error' })
  }
  assert.equal(errors.length, 3)
})

test('ラッパー: 外側から内側の順、ctx を足せる、s401 で打ち切れる', async () => {
  const log: string[] = []
  const outer: ComatypeWrap = async (r, next) => {
    log.push('outer')
    const res = await next({ ...r, ctx: { ...r.ctx, a: 1 } })
    return { ...res, headers: { ...res.headers, 'x-outer': '1' } }
  }
  const inner: ComatypeWrap = async (r, next) => {
    log.push('inner')
    if (r.headers['x-deny']) return s401({ error: { code: 'denied' } }) as never
    return next({ ...r, ctx: { ...r.ctx, b: 2 } })
  }
  s.init({ wrappers: { outer, inner } } as any)
  s.get(ep({ path: '/w', wraps: ['outer', 'inner'] }), (r: any) => s404({ error: { code: JSON.stringify(r.ctx) } }))
  const ok = await s.handle(req('GET', '/w'))
  assert.deepEqual(log, ['outer', 'inner'])
  assert.deepEqual(await ok.json(), { code: '{"a":1,"b":2}' })
  assert.equal(ok.headers.get('x-outer'), '1')
  const denied = await s.handle(req('GET', '/w', { headers: { 'x-deny': '1' } }))
  assert.equal(denied.status, 401)
  assert.deepEqual(await denied.json(), { code: 'denied' })
  assert.equal(denied.headers.get('x-outer'), '1') // the outer wrapper also sees the short-circuited response
})

test('ラッパーが足りなければ 500', async () => {
  s.get(ep({ path: '/w', wraps: ['nope'] }), () => s204())
  s.init({ onError: () => {} } as any)
  assert.equal((await s.handle(req('GET', '/w'))).status, 500)
})

test('Node の http サーバ越しに c と s がつながる', async () => {
  s.get(ep({ path: '/ok' }), () => s200({ data: { name: 'n', followers: 1n }, headers: { 'X-Count': 1 } }))
  const srv = await serve({ port: 0, server: s })
  try {
    const port = (srv.address() as import('node:net').AddressInfo).port
    const client = createClient({ config: { baseUrl: `http://127.0.0.1:${port}` } })
    const res: any = await (client.get as any)(ep({ path: '/ok' }), s200)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, { name: 'n', followers: 1n })
    assert.deepEqual(res.headers, { 'X-Count': 1 })
  } finally {
    srv.close()
  }
})

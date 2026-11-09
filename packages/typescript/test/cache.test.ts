import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { createServer as createHttp } from 'node:http'
import { createClient, createCookieJar, createServer, defineEndpoint, defineStatus, t } from '../src/index.ts'
import { MemoryCache, clientCacheKey, decodeCacheCookie, encodeCacheCookie, fnv1a, serverCacheKey } from '../src/cache.ts'
import { nodeListener } from '../src/node.ts'

const s200 = defineStatus<{ status: 200; data: { n: number } }, { data: { n: number } }>(200, t.object({ n: t.int() }))

const make = (cache: any) =>
  defineEndpoint<any, any, {}, 'get'>({
    method: 'get',
    path: '/n',
    module: 'n',
    wraps: [],
    cookie: false,
    cache,
    cacheHeaders: ['x-v'],
    params: null,
    search: null,
    body: null,
    requestHeaders: null,
    responses: [s200],
  })

test('MemoryCache: ttl で期限切れになり、上限を超えると古いものから捨てる', () => {
  let now = 1000
  const m = new MemoryCache<number>(2, () => now)
  m.set('a', 1, 100)
  assert.equal(m.get('a'), 1)
  now += 101
  assert.equal(m.get('a'), undefined)
  m.set('a', 1, 1000)
  m.set('b', 2, 1000)
  m.set('c', 3, 1000)
  assert.equal(m.get('a'), undefined)
  assert.equal(m.get('c'), 3)
})

test('cookie の符号化: 往復でき、大きすぎると作らない', () => {
  const res = { status: 200, headers: { 'x-a': 'あ' }, data: { n: 1, s: '日本語' } }
  const v = encodeCacheCookie(res)!
  assert.match(v, /^[A-Za-z0-9_-]+$/)
  assert.deepEqual(decodeCacheCookie(v), res)
  assert.equal(encodeCacheCookie({ status: 200, data: 'x'.repeat(5000) }), undefined)
  assert.equal(decodeCacheCookie('!!!'), undefined)
  assert.equal(fnv1a('a').length, 16)
})

test('キー: クライアントは宣言したヘッダだけ、サーバは全ヘッダ', () => {
  const a = clientCacheKey('get', 'http://h/n', undefined, ['X-V'], { 'x-v': '1', authorization: 'a' })
  const b = clientCacheKey('get', 'http://h/n', undefined, ['X-V'], { 'x-v': '1', authorization: 'b' })
  const c = clientCacheKey('get', 'http://h/n', undefined, ['X-V'], { 'x-v': '2' })
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.notEqual(serverCacheKey('get', '/n', { a: '1' }, ''), serverCacheKey('get', '/n', { a: '2' }, ''))
})

async function withServer(ep: ReturnType<typeof make>, fn: (base: string, calls: () => number) => Promise<void>) {
  let n = 0
  const s = createServer()
  s.get(ep, () => s200({ data: { n: ++n } }))
  const srv = createHttp(nodeListener(s))
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
  try {
    await fn(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`, () => n)
  } finally {
    srv.close()
  }
}

test('サーバのメモリキャッシュ: 完全一致で当たり、ヘッダが違えば当たらない', async () => {
  await withServer(make({ mode: 'memory', ttlMs: 60000 }), async (base, calls) => {
    const a = await (await fetch(`${base}/n`)).json()
    const b = await (await fetch(`${base}/n`)).json()
    assert.deepEqual(a, b)
    assert.equal(calls(), 1)
    await fetch(`${base}/n`, { headers: { 'x-other': '1' } })
    assert.equal(calls(), 2)
  })
})

test('cache off と cookie: サーバは、キャッシュしない', async () => {
  for (const cache of [{ mode: 'off' }, { mode: 'cookie', ttlMs: 60000 }, undefined]) {
    await withServer(make(cache), async (base, calls) => {
      await fetch(`${base}/n`)
      await fetch(`${base}/n`)
      assert.equal(calls(), 2)
    })
  }
})

test('クライアントのメモリキャッシュ: ttl の間だけ。clearCache で捨てる', async () => {
  await withServer(make(undefined), async (base, calls) => {
    const ep = make({ mode: 'memory', ttlMs: 60000 })
    const c = createClient({ config: { baseUrl: base } })
    const a = await c.get(ep, s200)
    const b = await c.get(ep, s200)
    assert.deepEqual(a, b)
    assert.equal(calls(), 1)
    // a different declared header gives a different key (ep requestHeaders is null, so the key is the same here)
    c.clearCache()
    await c.get(ep, s200)
    assert.equal(calls(), 2)
  })
})

test('クライアントの cookie キャッシュ: jar に載り、サーバへ送り返さない', async () => {
  await withServer(make(undefined), async (base, calls) => {
    const ep = make({ mode: 'cookie', ttlMs: 60000 })
    const jar = createCookieJar()
    const c = createClient({ config: { baseUrl: base, cookie: { jar } } })
    const a = await c.get(ep, s200)
    const b = await c.get(ep, s200)
    assert.deepEqual(a, b)
    assert.equal(calls(), 1)
    assert.ok(Object.keys(jar.get('/')).some((k) => k.startsWith('comatype_cache_')))
    c.clearCache()
    assert.ok(!Object.keys(jar.get('/')).some((k) => k.startsWith('comatype_cache_')))
    await c.get(ep, s200)
    assert.equal(calls(), 2)
  })
})

test('cache off: クライアントは毎回通信する', async () => {
  await withServer(make(undefined), async (base, calls) => {
    const c = createClient({ config: { baseUrl: base } })
    const ep = make({ mode: 'off' })
    await c.get(ep, s200)
    await c.get(ep, s200)
    assert.equal(calls(), 2)
  })
})

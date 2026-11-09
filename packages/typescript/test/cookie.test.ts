import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import {
  ComatypeError,
  type CookieDef,
  createClient,
  createCookieJar,
  createServer,
  defineEndpoint,
  defineStatus,
  serializeSetCookie,
  t,
} from '../src/index.ts'
import { serve } from '../src/node.ts'

const def: CookieDef = { name: 'session', httpOnly: true, secure: true, sameSite: 'lax' }

test('Set-Cookie の組み立て', () => {
  assert.equal(serializeSetCookie(def, 'abc'), 'session=abc; Path=/; HttpOnly; Secure; SameSite=Lax')
  assert.equal(serializeSetCookie(def, 'a b;c'), 'session=a%20b%3Bc; Path=/; HttpOnly; Secure; SameSite=Lax')
  assert.equal(
    serializeSetCookie({ ...def, path: '/api', domain: 'example.com', maxAge: 60 }, { value: 'x', maxAge: 10 }),
    'session=x; Path=/api; Domain=example.com; Max-Age=10; HttpOnly; Secure; SameSite=Lax',
  )
  const exp = new Date(Date.UTC(2030, 0, 2, 3, 4, 5))
  assert.match(serializeSetCookie(def, { value: 'x', expires: exp }), /Expires=Wed, 02 Jan 2030 03:04:05 GMT/)
  // null deletes
  assert.equal(
    serializeSetCookie(def, null),
    'session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
  )
  assert.throws(() => serializeSetCookie(def, { value: 'x', maxAge: -1 }), ComatypeError)
  assert.throws(() => serializeSetCookie(def, { value: 'x', path: '/a; Domain=evil' }), ComatypeError)
  assert.equal(serializeSetCookie({ name: 'a' }, 'v'), 'a=v; Path=/') // only attributes written in init.comat
})

test('cookie jar: 保持・path・期限・削除', () => {
  let now = 1_000_000
  const jar = createCookieJar(() => now)
  jar.store([
    'session=tok%20en; Path=/; HttpOnly',
    'scoped=1; Path=/admin',
    'short=1; Max-Age=10',
    'dated=1; Expires=Thu, 01 Jan 2099 00:00:00 GMT',
    'broken',
  ])
  assert.deepEqual(jar.get('/user'), { session: 'tok en', short: '1', dated: '1' })
  assert.deepEqual(jar.get('/admin/x'), { session: 'tok en', scoped: '1', short: '1', dated: '1' })
  assert.equal(jar.get('/administrator').scoped, undefined) // boundaries are split on /
  now += 11_000
  assert.equal(jar.get('/user').short, undefined) // past Max-Age
  jar.store(['session=; Max-Age=0; Path=/'])
  assert.equal(jar.get('/user').session, undefined) // deleted
  jar.clear()
  assert.deepEqual(jar.get('/'), {})
})

// ---- the server emits, the client jar keeps and sends back ----
type Init = { data?: { who: string }; error?: unknown; cookie?: Record<string, unknown> }
const s200 = defineStatus<any, Init>(200, t.object({ who: t.string() }))
const s401 = defineStatus<any, Init>(401, t.object({ code: t.string() }))
const ep = (over: Record<string, unknown>): any =>
  defineEndpoint<any, any, any>({
    method: 'get',
    path: '/x',
    module: 'x',
    wraps: [],
    cookie: true,
    cookieDef: def,
    params: null,
    search: null,
    body: null,
    requestHeaders: null,
    responses: [s200, s401],
    ...over,
  })

test('サーバが Set-Cookie を発行する（複数・削除・宣言外の名前）', async () => {
  const s = createServer()
  s.get(ep({ path: '/in' }), () => s200({ data: { who: 'a' }, cookie: { session: { value: 'tok', maxAge: 30 } } }))
  s.get(ep({ path: '/out' }), () => s200({ data: { who: 'a' }, cookie: { session: null } }))
  s.get(ep({ path: '/other' }), () => s200({ data: { who: 'a' }, cookie: { other: 'x' } }))
  s.get(ep({ path: '/off', cookie: false, cookieDef: undefined }), () => s200({ data: { who: 'a' }, cookie: { session: 'x' } }))
  s.init({ onError: () => {} } as any)

  const a = await s.handle(new Request('http://t/in'))
  assert.equal(a.status, 200)
  assert.equal(a.headers.get('set-cookie'), 'session=tok; Path=/; Max-Age=30; HttpOnly; Secure; SameSite=Lax')
  const b = await s.handle(new Request('http://t/out'))
  assert.match(b.headers.get('set-cookie')!, /^session=; Path=\/; Max-Age=0/)
  // an undeclared cookie, or one on a cookie off endpoint, is a server error, so 500 (no Set-Cookie is emitted)
  for (const p of ['/other', '/off']) {
    const r = await s.handle(new Request(`http://t${p}`))
    assert.equal(r.status, 500)
    assert.equal(r.headers.get('set-cookie'), null)
  }
})

test('ラッパーが作った s401 でも cookie を発行できる（期限切れの cookie を消す）', async () => {
  const s = createServer()
  s.init({ wrappers: { guard: async () => s401({ error: { code: 'expired' }, cookie: { session: null } }) as never } } as any)
  s.get(ep({ path: '/g', wraps: ['guard'] }), () => s200({ data: { who: 'a' } }))
  const r = await s.handle(new Request('http://t/g'))
  assert.equal(r.status, 401)
  assert.match(r.headers.get('set-cookie')!, /^session=; Path=\/; Max-Age=0/)
})

test('Node: ログイン → jar が保持 → 次のリクエストで cookie が届く → ログアウトで消える', async () => {
  const s = createServer()
  const login = ep({ method: 'post', path: '/login' })
  const me = ep({ path: '/me' })
  const logout = ep({ method: 'post', path: '/logout' })
  const noCookie = ep({ path: '/plain', cookie: false, cookieDef: undefined })
  const seen: (string | undefined)[] = []
  s.post(login, () => s200({ data: { who: 'x' }, cookie: { session: 'tok-1' } }))
  s.get(me, (r: any) => {
    seen.push(r.cookies.session)
    return r.cookies.session === 'tok-1' ? s200({ data: { who: 'me' } }) : s401({ error: { code: 'no' } })
  })
  s.post(logout, () => s200({ data: { who: 'x' }, cookie: { session: null } }))
  s.get(noCookie, (r: any) => {
    seen.push(r.cookies.session)
    return s200({ data: { who: 'p' } })
  })
  const srv = await serve({ port: 0, server: s })
  try {
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
    const jar = createCookieJar()
    const c: any = createClient({ config: { baseUrl: base, cookie: { jar } } })

    assert.equal((await c.get(me, s200, s401)).status, 401) // no cookie yet
    assert.equal((await c.post(login, s200)).status, 200)
    assert.deepEqual(jar.get('/'), { session: 'tok-1' }) // the jar keeps it even if HttpOnly (hiding it from JS is the browser's job)
    assert.equal((await c.get(me, s200, s401)).status, 200) // sent back
    seen.length = 0
    await c.get(noCookie, s200) // not sent to cookie off endpoints
    assert.deepEqual(seen, [undefined])
    assert.equal((await c.post(logout, s200)).status, 200)
    assert.deepEqual(jar.get('/'), {})
    assert.equal((await c.get(me, s200, s401)).status, 401)
  } finally {
    srv.close()
  }
})

test('クライアントのラッパーが r.cookies を足すと Cookie ヘッダになる', async () => {
  const s = createServer()
  const me = ep({ path: '/me', wraps: ['add'] })
  let got: string | undefined
  s.get(me, (r: any) => {
    got = r.cookies.session
    return s200({ data: { who: 'x' } })
  })
  s.init({ wrappers: { add: async (r: any, n: any) => n(r) } } as any)
  const srv = await serve({ port: 0, server: s })
  try {
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
    const c: any = createClient({
      config: {
        baseUrl: base,
        wrappers: { add: async (r: any, n: any) => n({ ...r, cookies: { ...r.cookies, session: 'from wrapper' } }) },
      },
    })
    await c.get(me, s200)
    assert.equal(got, 'from wrapper')
  } finally {
    srv.close()
  }
})

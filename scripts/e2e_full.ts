// Run the generated node_client of usage against the generated node_server (the real s)
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { c, s, createClient, createCookieJar, type ComatypeWrap } from '@comatype/typescript'
import { serve } from '@comatype/typescript/node'

import * as postUser from './node_client/comatype/post_user'
import * as getUser from './node_client/comatype/get_user'
import * as putUser from './node_client/comatype/user/put__id'
import * as deleteUser from './node_client/comatype/user/delete__id'
import * as listUsers from './node_client/comatype/user/get'
import * as profile from './node_client/comatype/user/profile/get'
import * as ping from './node_client/comatype/user/get_ping'
import * as login from './node_client/comatype/user/post_login'
import * as queryUser from './node_client/comatype/query_user'
import * as optionsUser from './node_client/comatype/options_user'
import { s401 } from './node_client/comatype/init'
import type { UserData } from './node_client/comatype/types'

// ---- Server (per-app storage and wrappers) ----
const db = new Map<string, UserData>()
const SESSION = 'session-token'

const serverAuth: ComatypeWrap<{ user: UserData }> = async (req, next) => {
  if (req.cookies.session !== SESSION && req.headers.authorization !== `Bearer ${SESSION}`) {
    return s401({ error: { code: 'unauthorized', message: 'login required' } }) as never
  }
  const user = [...db.values()][0] ?? { uid: '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10', name: 'guest', email: 'g@example.com', phone: '+8100' }
  return next({ ...req, ctx: { ...req.ctx, user } })
}
s.init({ wrappers: { auth: serverAuth } })

s.post(postUser.path, (req) => {
  const uid = crypto.randomUUID()
  db.set(uid, { ...req.body, uid })
  return postUser.s200({ data: db.get(uid)! })
})
s.get(getUser.path, (req) => {
  const u = db.get(req.params.id)
  return u ? getUser.s200({ data: u }) : getUser.s404({ error: { code: 'not_found', message: 'no user' } })
})
s.put(putUser.path, (req) => {
  if (!db.has(req.params.id)) return putUser.s404({ error: { code: 'not_found', message: 'no user' } })
  db.set(req.params.id, req.body)
  return putUser.s200({ data: req.body, headers: { 'X-Resource-Version': 'v2' } })
})
s.delete(deleteUser.path, (req) =>
  db.delete(req.params.id) ? deleteUser.s204() : deleteUser.s404({ error: { code: 'not_found', message: 'no user' } }),
)
s.get(listUsers.path, (req) => listUsers.s200({ data: [...db.values()].slice(0, req.search.limit ?? 100) }))
s.get(profile.path, (req) => profile.s200({ data: req.ctx.user }))
let pingCalls = 0
// ok flips on every call (a cache hit returns the same value)
s.get(ping.path, () => ping.s200({ data: { ok: ++pingCalls % 2 === 1 } }))
s.post(login.path, (req) =>
  req.body.password === 'pw'
    ? login.s200({ data: { uid: '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10' }, cookie: { session: { value: SESSION, maxAge: 3600 } } })
    : login.s401({ error: { code: 'bad', message: 'wrong' } }),
)
s.query(queryUser.path, (req) =>
  queryUser.s200({ data: [...db.values()].filter((u) => !req.body.name || u.name.includes(req.body.name)) }),
)
s.options(optionsUser.path, () => optionsUser.s200({ headers: { Allow: ['GET', 'POST', 'OPTIONS'] } }))

const srv = await serve({ port: 0 })
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`

// ---- Client ----
const clientAuth: ComatypeWrap = (req, next) => next({ ...req, headers: { ...req.headers, authorization: `Bearer ${SESSION}` } })
c.init({ baseUrl: base, wrappers: { auth: clientAuth } })

const created = await c.post(postUser.path, { name: 'taro', email: 'taro@example.com', phone: '+819012345678' }, postUser.s200)
assert.equal(created.status, 200)
const uid = created.data!.uid

const got = await c.get(getUser.path, { params: { id: uid }, search: { verbose: true } }, getUser.s200, getUser.s404)
assert.equal(got.status === 200 && got.data.name, 'taro')

const upd = await c.put(putUser.path, { params: { id: uid }, body: { ...created.data!, name: 'jiro' } }, putUser.s200, putUser.s404)
assert.equal(upd.status, 200)
if (upd.status === 200) assert.equal(upd.headers?.['X-Resource-Version'], 'v2')

const list = await c.get(listUsers.path, { search: { limit: 1 } }, listUsers.s200)
assert.equal(list.status === 200 && list.data.length, 1)

const q = await c.query(queryUser.path, { name: 'jir' }, queryUser.s200)
assert.equal(q.status === 200 && q.data.length, 1)

const opt = await c.options(optionsUser.path, optionsUser.s200)
assert.deepEqual(opt.status === 200 && opt.headers.Allow, ['GET', 'POST', 'OPTIONS'])

const prof = await c.get(profile.path, profile.s200)
assert.equal(prof.status, 200)

const ping1 = await c.get(ping.path, ping.s200)
assert.equal(ping1.status, 200)
// Client cache (cache 60000): the second call makes no request
const ping2 = await c.get(ping.path, ping.s200)
assert.deepEqual(ping2.status === 200 && ping2.data, ping1.status === 200 && ping1.data)
assert.equal(pingCalls, 1)
// After the cache is dropped it talks to the server again, but it is the same request, so the server cache hits (the handler is not called)
c.clearCache()
const ping3 = await c.get(ping.path, ping.s200)
assert.deepEqual(ping3.status === 200 && ping3.data, ping1.status === 200 && ping1.data)
assert.equal(pingCalls, 1)
const bad = await c.post(login.path, { email: 'a@b.co', password: 'nope' }, login.s200, login.s401)
assert.equal(bad.status, 401)
assert.equal(bad.status === 401 && bad.error.code, 'bad')

const nf = await c.get(getUser.path, { params: { id: crypto.randomUUID() } }, getUser.s200, getUser.s404)
assert.equal(nf.status, 404)

const del = await c.delete(deleteUser.path, { params: { id: uid } }, deleteUser.s204, deleteUser.s404)
assert.equal(del.status, 204)
assert.equal((await c.delete(deleteUser.path, { params: { id: uid } }, deleteUser.s204, deleteUser.s404)).status, 404)

// Without credentials the server's auth wrapper returns 401 (call directly, without the client wrapper)
// Server cache: an identical request gets the same response without calling the handler
const callsBefore = pingCalls
const sc1 = await (await fetch(`${base}/ping`)).text()
const sc2 = await (await fetch(`${base}/ping`)).text()
assert.equal(sc1, sc2)
assert.equal(pingCalls, callsBefore + 1)
// Different headers make a different request (exact match)
await fetch(`${base}/ping`, { headers: { 'x-other': '1' } })
assert.equal(pingCalls, callsBefore + 2)

const anon = await fetch(`${base}/user/profile`)
assert.equal(anon.status, 401)
assert.equal((await anon.json()).code, 'unauthorized')

// Invalid input gives 400
const invalid = await fetch(`${base}/user/not-a-uuid`, { headers: { authorization: `Bearer ${SESSION}` } })
assert.equal(invalid.status, 400)
assert.equal((await invalid.json()).code, 'validation_error')

// ---- cookie: login issues a Set-Cookie, the jar keeps it and sends it back with the next request ----
const jar = createCookieJar()
const viaCookie = createClient({ config: { baseUrl: base, wrappers: { auth: (req, next) => next(req) }, cookie: { jar } } })
assert.equal((await viaCookie.get(profile.path, profile.s200, profile.s401)).status, 401, 'ログイン前は 401')
const ok = await viaCookie.post(login.path, { email: 'a@b.co', password: 'pw' }, login.s200, login.s401)
assert.equal(ok.status, 200)
assert.deepEqual(jar.get('/'), { session: SESSION }, 'Set-Cookie が jar に入る')
assert.equal((await viaCookie.get(profile.path, profile.s200)).status, 200, 'cookie だけで認証される')
const raw = await fetch(`${base}/user/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', password: 'pw' }) })
assert.equal(raw.headers.get('set-cookie'), `session=${SESSION}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`)

srv.close()
console.log('e2e full (generated client <-> generated server): OK')

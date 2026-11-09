// Server-only tests: use no network, call s.handle(Request) directly
import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { s } from '../app'
import { DEMO, db } from '../db'

let demoUid = ''
beforeEach(() => {
  demoUid = db.reset().uid
})

const call = (method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) =>
  s.handle(
    new Request(`http://test${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  )

/** Log in and return the value of the session cookie */
async function login(): Promise<string> {
  const res = await call('POST', '/user/login', { body: DEMO })
  assert.equal(res.status, 200)
  const setCookie = res.headers.get('set-cookie')!
  assert.match(setCookie, /^session=[0-9a-f-]{36}; Path=\/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax$/)
  return setCookie.split(';')[0].split('=')[1]
}

test('ping は未ログインで呼べる（wrap auth off、固定の path）', async () => {
  const res = await call('GET', '/ping')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
  assert.ok(res.headers.get('x-server-time'))
})

test('wrap auth: ログインが無いと 401、cookie か Bearer があれば通る', async () => {
  for (const path of ['/user/profile', '/user/me', '/user', `/user/${demoUid}`]) {
    const res = await call('GET', path)
    assert.equal(res.status, 401, path)
    assert.deepEqual(await res.json(), { code: 'unauthorized', message: 'login required' })
  }
  const token = await login()
  const viaCookie = await call('GET', '/user/profile', { headers: { cookie: `session=${token}` } })
  assert.equal(viaCookie.status, 200)
  assert.equal((await viaCookie.json()).email, DEMO.email)
  const viaBearer = await call('GET', '/user/me', { headers: { authorization: `Bearer ${token}` } })
  assert.equal(viaBearer.status, 200)
  assert.equal((await call('GET', '/user/profile', { headers: { cookie: 'session=forged' } })).status, 401)
})

test('ログイン: 間違ったパスワードは 401（cookie は出ない）、不正な入力は 400', async () => {
  const bad = await call('POST', '/user/login', { body: { email: DEMO.email, password: 'nope' } })
  assert.equal(bad.status, 401)
  assert.equal((await bad.json()).code, 'invalid_credentials')
  assert.equal(bad.headers.get('set-cookie'), null)

  const invalid = await call('POST', '/user/login', { body: { email: 'not-an-email', password: 'x' } })
  assert.equal(invalid.status, 400)
  const body = await invalid.json()
  assert.equal(body.code, 'validation_error')
  assert.equal(body.path, 'body.email')
})

test('登録 → 取得 → 更新 → 削除', async () => {
  const token = await login()
  const auth = { cookie: `session=${token}` }

  // Sign-up can be called while logged out. The server decides uid
  const created = await call('POST', '/user', { body: { name: 'jiro', email: 'jiro@example.com', phone: '+819011112222' } })
  assert.equal(created.status, 200)
  const user = await created.json()
  assert.match(user.uid, /^[0-9a-f-]{36}$/)

  const got = await call('GET', `/user/${user.uid}`, { headers: auth })
  assert.deepEqual(await got.json(), user)

  const put = await call('PUT', `/user/${user.uid}`, { headers: auth, body: { ...user, name: 'jiro2', uid: demoUid } })
  assert.equal(put.status, 200)
  assert.equal(put.headers.get('x-resource-version'), 'v2')
  const updated = await put.json()
  assert.equal(updated.name, 'jiro2')
  assert.equal(updated.uid, user.uid, 'uid はボディで変えられない')

  assert.equal((await call('DELETE', `/user/${user.uid}`, { headers: auth })).status, 204)
  assert.equal((await call('DELETE', `/user/${user.uid}`, { headers: auth })).status, 404)
  assert.equal((await call('GET', `/user/${user.uid}`, { headers: auth })).status, 404)
})

test('登録の入力検証: 必須と形式', async () => {
  const ok = { name: 'a', email: 'a@example.com', phone: '+819011112222' }
  assert.equal((await call('POST', '/user', { body: ok })).status, 200)
  for (const [bad, path] of [
    [{ ...ok, email: 'x' }, 'body.email'],
    [{ ...ok, phone: '090' }, 'body.phone'],
    [{ name: 'a' }, 'body.email'],
  ] as const) {
    const res = await call('POST', '/user', { body: bad })
    assert.equal(res.status, 400)
    assert.equal((await res.json()).path, path)
  }
  assert.equal((await call('POST', '/user')).status, 400, 'ボディが無い')
})

test('パラメータとヘッダ: 不正な uuid は 400、verbose のときは X-Request-Id を返す', async () => {
  const token = await login()
  const auth = { cookie: `session=${token}` }
  const bad = await call('GET', '/user/not-a-uuid', { headers: auth })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).path, 'params.id')

  const id = crypto.randomUUID()
  const plain = await call('GET', `/user/${demoUid}`, { headers: { ...auth, 'x-request-id': id } })
  assert.equal(plain.headers.get('x-request-id'), null)
  const verbose = await call('GET', `/user/${demoUid}?verbose=true`, { headers: { ...auth, 'x-request-id': id } })
  assert.equal(verbose.headers.get('x-request-id'), id)
  assert.equal((await call('GET', `/user/${demoUid}?verbose=maybe`, { headers: auth })).status, 400)
  assert.equal((await call('GET', `/user/${demoUid}`, { headers: { ...auth, 'x-request-id': 'nope' } })).status, 400)
})

test('一覧（search の limit）と QUERY（ボディで検索）', async () => {
  const token = await login()
  const auth = { cookie: `session=${token}` }
  for (const name of ['aki', 'aoi', 'ben']) db.create({ name, email: `${name}@example.com`, phone: '+819000000000' })

  assert.equal((await (await call('GET', '/user', { headers: auth })).json()).length, 4)
  assert.equal((await (await call('GET', '/user?limit=2', { headers: auth })).json()).length, 2)
  assert.equal((await call('GET', '/user?limit=x', { headers: auth })).status, 400)

  const q = await call('QUERY', '/user', { headers: auth, body: { name: 'a' } })
  assert.deepEqual((await q.json()).map((u: { name: string }) => u.name).sort(), ['aki', 'aoi', 'taro'])
  const byEmail = await call('QUERY', '/user', { headers: auth, body: { email: 'ben@example.com', limit: 1 } })
  assert.equal((await byEmail.json()).length, 1)
})

test('OPTIONS は Allow ヘッダだけ返す。未知の path は 404、メソッド違いは 405', async () => {
  const token = await login()
  const opt = await call('OPTIONS', '/user', { headers: { cookie: `session=${token}` } })
  assert.equal(opt.status, 200)
  assert.equal(opt.headers.get('allow'), 'GET, POST, PUT, DELETE, OPTIONS, QUERY')
  assert.equal(await opt.text(), '')

  assert.equal((await call('GET', '/nope')).status, 404)
  const m = await call('PATCH', '/ping')
  assert.equal(m.status, 405)
  assert.equal(m.headers.get('allow'), 'GET')
})

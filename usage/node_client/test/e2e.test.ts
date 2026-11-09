// Client E2E: start node_server in a separate process and connect over real HTTP

import assert from 'node:assert/strict'
import { type ChildProcess, spawn } from 'node:child_process'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { c, UnexpectedStatusError, ValidationError } from '@comatype/typescript'
import * as getProfileApi from '@/comatype/user/profile/get'
import * as api from '../api'
import { initComatype } from '../init'

let server: ChildProcess
let baseUrl = ''
const serverDir = fileURLToPath(new URL('../../node_server', import.meta.url))

before(async () => {
  // The paths (@/) of tsconfig use the server's, so set cwd to the server directory
  server = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], { cwd: serverDir, stdio: ['ignore', 'pipe', 'inherit'] })
  baseUrl = await new Promise<string>((ok, ng) => {
    let out = ''
    server.stdout!.on('data', (d) => {
      out += d
      const m = out.match(/LISTENING (http:\/\/\S+)/)
      if (m) ok(m[1])
    })
    server.once('exit', (code) => ng(new Error(`サーバが終了しました: ${code}`)))
  })
})
after(() => server.kill())

test('ログイン前: ping は通り、profile は 401', async () => {
  initComatype(baseUrl)
  const ping = await api.ping()
  assert.equal(ping.status, 200)
  assert.equal(ping.data?.ok, true)
  assert.ok(ping.headers?.['X-Server-Time'], 'レスポンスヘッダ（datetime）が型どおりに読める')

  const profile = await api.getProfile()
  assert.equal(profile.status, 401)
  if (profile.status === 401) assert.equal(profile.error.code, 'unauthorized')
})

test('ログインすると cookie が jar に入り、以降の cookie on のリクエストに送られる', async () => {
  const { jar } = initComatype(baseUrl)
  const bad = await api.login({ email: 'taro@example.com', password: 'wrong' })
  assert.equal(bad.status, 401)
  assert.deepEqual(jar.get('/'), {})

  const ok = await api.login({ email: 'taro@example.com', password: 'password' })
  assert.equal(ok.status, 200)
  assert.match(jar.get('/').session, /^[0-9a-f-]{36}$/)

  const profile = await api.getProfile()
  assert.equal(profile.status, 200)
  if (profile.status === 200) assert.equal(profile.data.email, 'taro@example.com')
  const me = await api.getMe()
  assert.equal(me.status === 200 && me.data.name, 'taro')

  jar.clear() // After dropping the cookie, 401 again
  assert.equal((await api.getProfile()).status, 401)
})

test('登録 → 取得 → 更新 → 削除', async () => {
  initComatype(baseUrl)
  await api.login({ email: 'taro@example.com', password: 'password' })

  // postUser returns the body (UserData) on success
  const user = (await api.postUser({ name: 'jiro', email: 'jiro@example.com', phone: '+819011112222' }))!
  assert.equal(user.name, 'jiro')

  const got = await api.getUser(user.uid)
  assert.equal(got.status === 200 && got.data.email, 'jiro@example.com')

  const put = await api.putUser(user.uid, { ...user, name: 'jiro2' })
  assert.equal(put.status, 200)
  if (put.status === 200) {
    assert.equal(put.data.name, 'jiro2')
    assert.equal(put.headers?.['X-Resource-Version'], 'v2')
  }

  const del = await api.deleteUser(user.uid)
  assert.equal(del.status, 204)
  const again = await api.deleteUser(user.uid)
  assert.equal(again.status, 404)
  if (again.status === 404) assert.equal(again.error.code, 'not_found')
  assert.equal((await api.getUser(user.uid)).status, 404)
})

test('X-Request-Id は、ラッパーが付けて、サーバが返す', async () => {
  initComatype(baseUrl)
  await api.login({ email: 'taro@example.com', password: 'password' })
  const me = await api.getProfile() // not returned because verbose is not set
  assert.equal(me.status, 200)
  const taro = me.status === 200 ? me.data : undefined
  const res = await api.getUser(taro!.uid, true)
  assert.equal(res.status, 200)
  if (res.status === 200) assert.match(res.headers?.['X-Request-Id'] ?? '', /^[0-9a-f-]{36}$/)
})

test('一覧・QUERY・OPTIONS', async () => {
  initComatype(baseUrl)
  await api.login({ email: 'taro@example.com', password: 'password' })
  for (const name of ['aki', 'aoi']) await api.postUser({ name, email: `${name}@example.com`, phone: '+819000000000' })

  const all = await api.listUsers()
  assert.equal(all.status === 200 && all.data.length >= 3, true)
  const one = await api.listUsers(1)
  assert.equal(one.status === 200 && one.data.length, 1)

  const q = await api.queryUsers({ name: 'ao' })
  assert.deepEqual(q.status === 200 && q.data.map((u) => u.name), ['aoi'])

  const opt = await api.optionsUser()
  assert.equal(opt.status, 200)
  assert.deepEqual(opt.headers.Allow, ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'QUERY'])
})

test('送る前の検証と、渡していないステータス', async () => {
  initComatype(baseUrl)
  // An invalid email gives a ValidationError without sending a request
  await assert.rejects(
    api.login({ email: 'not-an-email', password: 'x' }),
    (e: unknown) => e instanceof ValidationError && e.path === 'email',
  )
  await assert.rejects(api.getUser('not-a-uuid'), (e: unknown) => e instanceof ValidationError)

  // s401 was not passed, so a 401 response throws
  await assert.rejects(
    c.get(getProfileApi.path, getProfileApi.s200),
    (e: unknown) => e instanceof UnexpectedStatusError && e.status === 401,
  )
})

// Run the generated usage node_client against a real HTTP server (executed with tsx)

import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { type ComatypeWrap, c } from '@comatype/typescript'
import { s401 } from './node_client/comatype/init'
import { s200 as optionsOk, path as optionsPath } from './node_client/comatype/options_user'
import { s200 as pingOk, path as pingPath } from './node_client/comatype/user/get_ping'
import { s401 as loginNo, s200 as loginOk, path as loginPath } from './node_client/comatype/user/post_login'
import { s200 as profileOk, path as profilePath } from './node_client/comatype/user/profile/get'
import { s404 as putNotFound, s200 as putOk, path as putPath } from './node_client/comatype/user/put__id'

const ID = '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10'
const USER = { name: 'taro', email: 'taro@example.com', phone: '+819012345678', uid: ID }
const seen: { method: string; url: string; auth?: string; body?: unknown }[] = []

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (d) => (raw += d))
  req.on('end', () => {
    seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined })
    const json = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers })
      res.end(body === undefined ? '' : JSON.stringify(body))
    }
    const url = req.url!
    if (req.method === 'OPTIONS' && url === '/user') return json(200, undefined, { Allow: 'GET, POST, OPTIONS', 'X-Request-Id': ID })
    if (url === '/ping') return json(200, { ok: true })
    if (url === '/user/login') return json(401, { code: 'bad_credentials', message: 'no' })
    if (req.method === 'PUT' && url === `/user/${ID}`) return json(200, JSON.parse(raw), { 'X-Resource-Version': 'v7' })
    if (url === '/user/profile') return json(200, USER)
    json(404, { code: 'not_found', message: url })
  })
})
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

let token: string | undefined = 'secret'
const auth: ComatypeWrap = async (req, next) => {
  if (!token) return s401({ error: { code: 'unauthorized', message: 'login required' } }) as never
  return next({ ...req, headers: { ...req.headers, authorization: `Bearer ${token}` } })
}
c.init({ baseUrl: base, wrappers: { auth } })

// put: params + body. Response headers are typed
const put = await c.put(putPath, { params: { id: ID }, body: USER }, putOk, putNotFound)
assert.equal(put.status, 200)
if (put.status === 200) {
  assert.deepEqual(put.data, USER)
  assert.equal(put.headers?.['X-Resource-Version'], 'v7')
}
assert.equal(seen.at(-1)?.auth, 'Bearer secret')

// options: Allow becomes an array
const opt = await c.options(optionsPath, optionsOk)
if (opt.status === 200) assert.deepEqual(opt.headers.Allow, ['GET', 'POST', 'OPTIONS'])
else assert.fail()

// profile: no arguments
const prof = await c.get(profilePath, profileOk)
assert.equal(prof.status, 200)

// Endpoints with wrap auth off get no wrapper (no Authorization is added)
const ping = await c.get(pingPath, pingOk)
assert.equal(ping.status, 200)
assert.equal(seen.at(-1)?.auth, undefined)
const login = await c.post(loginPath, { email: 'a@b.co', password: 'x' }, loginOk, loginNo)
assert.equal(login.status, 401)
assert.equal(seen.at(-1)?.auth, undefined)

// When the wrapper returns s401, it returns without sending a request
token = undefined
const before = seen.length
const denied = await c.get(profilePath, profileOk)
assert.equal(denied.status, 401)
assert.equal(seen.length, before)

// Validation: an invalid email is not sent
await assert.rejects(() => c.post(loginPath, { email: 'not-email', password: 'x' }, loginOk, loginNo), /email/)
assert.equal(seen.length, before)

server.close()
console.log('e2e client: OK')

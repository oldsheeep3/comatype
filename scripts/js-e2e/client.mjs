// Run the generated usage JavaScript client against a real HTTP server (scripts/e2e-js.sh runs it in a temporary directory)

import assert from 'node:assert/strict'
import http from 'node:http'
import { c } from '@comatype/javascript'
import { s401 } from './comatype/init.js'
import { s200 as optionsOk, path as optionsPath } from './comatype/options_user.js'
import { s200 as pingOk, path as pingPath } from './comatype/user/get_ping.js'
import { s401 as loginNo, s200 as loginOk, path as loginPath } from './comatype/user/post_login.js'
import { s200 as profileOk, path as profilePath } from './comatype/user/profile/get.js'
import { s404 as putNotFound, s200 as putOk, path as putPath } from './comatype/user/put__id.js'

const ID = '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10'
const USER = { name: 'taro', email: 'taro@example.com', phone: '+819012345678', uid: ID }
const seen = []

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (d) => (raw += d))
  req.on('end', () => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined })
    const json = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers })
      res.end(body === undefined ? '' : JSON.stringify(body))
    }
    const url = req.url
    if (req.method === 'OPTIONS' && url === '/user') return json(200, undefined, { Allow: 'GET, POST, OPTIONS', 'X-Request-Id': ID })
    if (url === '/ping') return json(200, { ok: true })
    if (url === '/user/login') return json(401, { code: 'bad_credentials', message: 'no' })
    if (req.method === 'PUT' && url === `/user/${ID}`) return json(200, JSON.parse(raw), { 'X-Resource-Version': 'v7' })
    if (url === '/user/profile') return json(200, USER)
    json(404, { code: 'not_found', message: url })
  })
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const base = `http://127.0.0.1:${server.address().port}`

let token = 'secret'
const auth = async (req, next) => {
  if (!token) return s401({ error: { code: 'unauthorized', message: 'login required' } })
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

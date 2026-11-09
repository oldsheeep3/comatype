// Check that the types of the generated usage node_client/comatype work as intended (tsc only, nothing is run)
import { s200, s404, endpoint, Body, type Response, type Request } from './node_client/comatype/user/put__id'
import { s200 as postOk, Body as PostBody } from './node_client/comatype/post_user'
import { s200 as optionsOk } from './node_client/comatype/options_user'
import { s204 as deleted } from './node_client/comatype/user/delete__id'
import type { UserData } from './node_client/comatype/types'
import type { Wrappers, AuthCtx } from './node_client/comatype/init'
import type { ComatypeWrap } from '@comatype/typescript'

declare const user: UserData

// 2xx is data, everything else is error
s200({ data: user })
s404({ error: { code: 'not_found', message: 'x' } })
// @ts-expect-error error cannot be passed for 2xx
s200({ error: user })
// @ts-expect-error data cannot be passed for 404
s404({ data: user })
// @ts-expect-error wrong type for data
s200({ data: { name: 1 } })

// s200.Res
const res: s200.Res = user
const err: s404.Res = { code: 'a', message: 'b' }
void res, err

// No body means no argument
deleted()
// @ts-expect-error data cannot be passed for a none response
deleted({ data: 1 })
// Required headers must be passed even without a body
optionsOk({ headers: { Allow: ['GET'] } })
// @ts-expect-error Allow is required
optionsOk({ headers: {} })
// @ts-expect-error Allow is required (headers itself is required too)
optionsOk()

// Response can be narrowed by status
declare const r: Response
if (r.status === 200) {
  const d: UserData = r.data
  void d
} else if (r.status === 404) {
  const e: { code: string } = r.error
  void e
}

// Request is { params, body } (headers are optional)
const req: Request = { params: { id: '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10' }, body: user }
// @ts-expect-error params is required
const bad: Request = { body: user }
void req, bad

// The body of post_user has no uid
const pb: PostBody = { name: 'a', email: 'a@b.co', phone: '+8190' }
// @ts-expect-error uid is empty, so it cannot be sent
const pb2: PostBody = { name: 'a', email: 'a@b.co', phone: '+8190', uid: 'x' }
void pb, pb2
postOk({ data: { name: 'a', email: 'a@b.co', phone: '+8190', uid: '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10' } })

// endpoint carries metadata
void endpoint.method, Body

// Wrappers is built from the wrappers in init.comat
const auth: ComatypeWrap<AuthCtx> = async (req, next) => next({ ...req, ctx: { ...req.ctx, user } })
const w: Wrappers = { auth }
// @ts-expect-error auth is missing
const w2: Wrappers = {}
void w, w2

// ---- Client c ----
import { c, createCookieJar } from '@comatype/typescript'
import { path as putPath, s200 as putOk, s404 as putNotFound } from './node_client/comatype/user/put__id'
import { path as postPath, s200 as postUserOk } from './node_client/comatype/post_user'
import { path as getUserPath, s200 as getUserOk, s404 as getUserNotFound } from './node_client/comatype/get_user'
import { path as listPath, s200 as listOk } from './node_client/comatype/user/get'
import { path as profilePath, s200 as profileOk } from './node_client/comatype/user/profile/get'
import { path as optionsPath } from './node_client/comatype/options_user'
import { path as deletePath, s204 as deleteOk, s404 as deleteNotFound } from './node_client/comatype/user/delete__id'
import { path as queryPath, s200 as queryOk, Body as QueryBody } from './node_client/comatype/query_user'
import { path as loginPath, s200 as loginOk, s401 as loginUnauthorized } from './node_client/comatype/user/post_login'

async function clientUsage(id: string, input: UserData, q: QueryBody) {
  // put: { params, body } + success + error
  const put = await c.put(putPath, { params: { id }, body: input }, putOk, putNotFound)
  if (put.status === 200) {
    const d: UserData = put.data
    void d
  }
  if (put.status === 404) {
    const e: { code: string } = put.error
    void e
  }

  // post: pass the body as is. The result can be destructured as { status, data, error }
  const { status, data, error } = await c.post(postPath, input, postUserOk)
  if (status === 200) {
    const d: UserData = data
    void d
  }
  void error

  // get: params and search
  const g = await c.get(getUserPath, { params: { id }, search: { verbose: true } }, getUserOk, getUserNotFound)
  if (g.status === 200) g.data.name

  // get: only search (the argument can be omitted entirely)
  await c.get(listPath, { search: { limit: 10 } }, listOk)
  await c.get(listPath, listOk)
  // No arguments
  const p = await c.get(profilePath, profileOk)
  if (p.status === 200) p.data.uid

  // options: the headers end up in res.headers
  const o = await c.options(optionsPath, optionsOk)
  if (o.status === 200) {
    const allow: string[] = o.headers.Allow
    void allow
  }

  // delete / query / post(login)
  const del = await c.delete(deletePath, { params: { id } }, deleted, deleteNotFound)
  if (del.status === 204) {
    // @ts-expect-error s204 is none, so there is no data
    del.data.x
  }
  void deleteOk
  const qr = await c.query(queryPath, q, queryOk)
  if (qr.status === 200) qr.data.length
  const login = await c.post(loginPath, { email: 'a@b.co', password: 'x' }, loginOk, loginUnauthorized)
  if (login.status === 401) login.error.message

  // @ts-expect-error params is required
  await c.put(putPath, { body: input }, putOk)
  // @ts-expect-error wrong type for body
  await c.put(putPath, { params: { id }, body: { name: 1 } }, putOk)
  // @ts-expect-error a body is required
  await c.post(postPath, postUserOk)
  // @ts-expect-error a status that was not passed (s404) cannot be narrowed
  if (put.status === 500) void 0

  // with: another client with extra headers
  await c.with({ headers: { 'x-trace': '1' } }).get(profilePath, profileOk)
}
void clientUsage

// init: a compile error unless all the wrappers of init.comat are provided
c.init({ wrappers: { auth }, cookie: { credentials: 'include' } })
// @ts-expect-error auth is missing
c.init({ wrappers: {} })
// @ts-expect-error wrappers is required
c.init({ baseUrl: 'http://x' })

// ---- Server s ----
import { s } from '@comatype/typescript'
import { path as sPutPath, s200 as sPutOk, s404 as sPutNotFound } from './node_client/comatype/user/put__id'
import { path as sPostPath, s200 as sPostOk } from './node_client/comatype/post_user'
import { path as sGetPath, s200 as sGetOk } from './node_client/comatype/get_user'
import { path as sListPath, s200 as sListOk } from './node_client/comatype/user/get'
import { path as sProfilePath, s200 as sProfileOk } from './node_client/comatype/user/profile/get'
import { path as sPingPath, s200 as sPingOk } from './node_client/comatype/user/get_ping'
import { path as sOptionsPath, s200 as sOptionsOk } from './node_client/comatype/options_user'
import { path as sDeletePath, s204 as sDeleteOk, s404 as sDeleteNotFound } from './node_client/comatype/user/delete__id'

// put: params.id / body are typed. The data is UserData
s.put(sPutPath, async (req) => {
  const id: string = req.params.id
  const body: UserData = req.body
  void id
  // @ts-expect-error no such field
  req.body.nope
  if (body.name === '') return sPutNotFound({ error: { code: 'nf', message: 'x' } })
  return sPutOk({ data: body })
})

// post: the data of s200 is UserData (including uid)
s.post(sPostPath, (req) => sPostOk({ data: { ...req.body, uid: '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10' } }))

// get: search.verbose is boolean | undefined
s.get(sGetPath, (req) => {
  const v: boolean | undefined = req.search.verbose
  void v
  return sPutOk({ data: user })
})
void sGetOk

// search only, all optional
s.get(sListPath, (req) => {
  const l: number | undefined = req.search.limit
  void l
  return sListOk({ data: [user] })
})

// wrap auth is on -> req.ctx.user is readable. Under (noauth) ctx has no user
s.get(sProfilePath, (req) => {
  const u: UserData = req.ctx.user
  return sProfileOk({ data: u })
})
s.get(sPingPath, (req) => {
  // @ts-expect-error wrap auth is off, so ctx.user does not exist
  req.ctx.user
  return sPingOk({ data: { ok: true } })
})

// options: return only the headers. Allow is required
s.options(sOptionsPath, () => sOptionsOk({ headers: { Allow: ['GET'] } }))
// @ts-expect-error Allow is missing
s.options(sOptionsPath, () => sOptionsOk({ headers: {} }))

// delete: s204 without arguments
s.delete(sDeletePath, (req) => {
  void req.params.id
  return Math.random() > 0.5 ? sDeleteNotFound({ error: { code: 'nf', message: 'x' } }) : sDeleteOk()
})

// A handler cannot return anything but the Response of its endpoint
// @ts-expect-error 404 is in the Response of delete, but the s200 of put is not
s.delete(sDeletePath, () => sPutOk({ data: user }))
// @ts-expect-error wrong type for data
s.put(sPutPath, () => sPutOk({ data: { name: 1 } }))
// @ts-expect-error a PUT endpoint cannot be passed to s.get
s.get(sPutPath, () => sPutOk({ data: user }))

s.init({ wrappers: { auth }, onError: (e) => void e })
// @ts-expect-error auth is missing
s.init({ wrappers: {} })

// ---- Issuing cookies ----
import { path as lPath, s200 as lOk } from './node_client/comatype/user/post_login'
const uid = '3f2b8c1e-5d4a-4b6e-9c1d-2a7f0e8b9c10'
s.post(lPath, () => lOk({ data: { uid }, cookie: { session: 'token' } }))
s.post(lPath, () => lOk({ data: { uid }, cookie: { session: { value: 'token', maxAge: 3600, expires: new Date() } } }))
s.post(lPath, () => lOk({ data: { uid }, cookie: { session: null } }))
// @ts-expect-error a cookie not declared in init.comat
s.post(lPath, () => lOk({ data: { uid }, cookie: { other: 'x' } }))
// @ts-expect-error a cookie value is a string, an object or null
s.post(lPath, () => lOk({ data: { uid }, cookie: { session: 1 } }))
c.init({ wrappers: { auth }, cookie: { jar: createCookieJar() } })

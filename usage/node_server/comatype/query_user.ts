// 自動生成: comatype generate が作ったファイルです。手で編集しないでください
import { t, defineStatus, defineEndpoint, type Schema, type StatusFn, type Endpoint, type CookieInit, type Email, type Uuid, type DateTimeStr } from '@comatype/typescript'
import { UserData, ApiError } from './types'
import type { AuthCtx } from './init'

export type Body = {
  name?: string;
  email?: Email;
  limit?: number;
}
export const Body: Schema<Body> = t.object({
  name: t.opt(t.string()),
  email: t.opt(t.email()),
  limit: t.opt(t.int()),
})

export type RequestHeaders = {
  "X-Client-Version"?: string;
  "X-Request-Id"?: Uuid;
}
export const RequestHeaders: Schema<RequestHeaders> = t.object({
  "X-Client-Version": t.opt(t.string()),
  "X-Request-Id": t.opt(t.uuid()),
})

export type Request = { body: Body; headers?: RequestHeaders }

const headers200: Schema<s200.Headers> = t.object({
  "X-Request-Id": t.opt(t.uuid()),
  "X-Server-Time": t.opt(t.datetime()),
})
export type S200 = { status: 200; data: UserData[]; headers?: s200.Headers }
export const s200: StatusFn<S200, { data: UserData[]; headers?: s200.Headers; cookie?: CookieInit }> = defineStatus(200, t.array(t.lazy(() => UserData)), headers200)
export declare namespace s200 {
  type Res = UserData[]
  type Headers = {
    "X-Request-Id"?: Uuid;
    "X-Server-Time"?: DateTimeStr;
  }
}

const headers401: Schema<s401.Headers> = t.object({
  "X-Request-Id": t.opt(t.uuid()),
  "X-Server-Time": t.opt(t.datetime()),
})
export type S401 = { status: 401; error: ApiError; headers?: s401.Headers }
export const s401: StatusFn<S401, { error: ApiError; headers?: s401.Headers; cookie?: CookieInit }> = defineStatus(401, t.lazy(() => ApiError), headers401)
export declare namespace s401 {
  type Res = ApiError
  type Headers = {
    "X-Request-Id"?: Uuid;
    "X-Server-Time"?: DateTimeStr;
  }
}

const headers500: Schema<s500.Headers> = t.object({
  "X-Request-Id": t.opt(t.uuid()),
  "X-Server-Time": t.opt(t.datetime()),
})
export type S500 = { status: 500; error: ApiError; headers?: s500.Headers }
export const s500: StatusFn<S500, { error: ApiError; headers?: s500.Headers; cookie?: CookieInit }> = defineStatus(500, t.lazy(() => ApiError), headers500)
export declare namespace s500 {
  type Res = ApiError
  type Headers = {
    "X-Request-Id"?: Uuid;
    "X-Server-Time"?: DateTimeStr;
  }
}

export type Response = S200 | S401 | S500

export type Ctx = AuthCtx

export const endpoint: Endpoint<Request, Response, Ctx, "query"> = defineEndpoint({
  method: "query",
  path: "/user",
  module: "query_user",
  baseUrl: "https://api.example.com",
  wraps: ["auth"],
  cookie: true,
  cookieDef: { name: "session", httpOnly: true, secure: true, sameSite: "lax" },
  params: null,
  search: null,
  body: Body,
  requestHeaders: RequestHeaders,
  responses: [s200, s401, s500],
})
/** Same value as `endpoint` (callers import it as `path`) */
export const path = endpoint

const _ep = { path, endpoint, s200, s401, s500 }
type _Request = Request
type _Response = Response
type _Ctx = Ctx
type _Body = Body
type _RequestHeaders = RequestHeaders
declare namespace _ep {
  export type Request = _Request
  export type Response = _Response
  export type Ctx = _Ctx
  export type Body = _Body
  export type RequestHeaders = _RequestHeaders
}
export default _ep

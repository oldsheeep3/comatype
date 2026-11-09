// 自動生成: comatype generate が作ったファイルです。手で編集しないでください
import { t, defineStatus, defineEndpoint, type Schema, type StatusFn, type Endpoint, type CookieInit, type Email, type Uuid, type Uuidv4, type DateTimeStr } from '@comatype/typescript'
import { ApiError } from '../types'

export type Body = {
  email: Email;
  password: string;
}
export const Body: Schema<Body> = t.object({
  email: t.email(),
  password: t.string(),
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
  "X-Resource-Version": t.opt(t.string()),
  "X-Server-Time": t.opt(t.datetime()),
})
export type S200 = { status: 200; data: {
    uid: Uuidv4;
  }; headers?: s200.Headers }
export const s200: StatusFn<S200, { data: {
    uid: Uuidv4;
  }; headers?: s200.Headers; cookie?: CookieInit }> = defineStatus(200, t.object({
  uid: t.uuidv4(),
}), headers200)
export declare namespace s200 {
  type Res = {
    uid: Uuidv4;
  }
  type Headers = {
    "X-Request-Id"?: Uuid;
    "X-Resource-Version"?: string;
    "X-Server-Time"?: DateTimeStr;
  }
}

const headers401: Schema<s401.Headers> = t.object({
  "X-Request-Id": t.opt(t.uuid()),
  "X-Resource-Version": t.opt(t.string()),
  "X-Server-Time": t.opt(t.datetime()),
})
export type S401 = { status: 401; error: ApiError; headers?: s401.Headers }
export const s401: StatusFn<S401, { error: ApiError; headers?: s401.Headers; cookie?: CookieInit }> = defineStatus(401, t.lazy(() => ApiError), headers401)
export declare namespace s401 {
  type Res = ApiError
  type Headers = {
    "X-Request-Id"?: Uuid;
    "X-Resource-Version"?: string;
    "X-Server-Time"?: DateTimeStr;
  }
}

const headers500: Schema<s500.Headers> = t.object({
  "X-Request-Id": t.opt(t.uuid()),
  "X-Resource-Version": t.opt(t.string()),
  "X-Server-Time": t.opt(t.datetime()),
})
export type S500 = { status: 500; error: ApiError; headers?: s500.Headers }
export const s500: StatusFn<S500, { error: ApiError; headers?: s500.Headers; cookie?: CookieInit }> = defineStatus(500, t.lazy(() => ApiError), headers500)
export declare namespace s500 {
  type Res = ApiError
  type Headers = {
    "X-Request-Id"?: Uuid;
    "X-Resource-Version"?: string;
    "X-Server-Time"?: DateTimeStr;
  }
}

export type Response = S200 | S401 | S500

export type Ctx = {}

export const endpoint: Endpoint<Request, Response, Ctx, "post"> = defineEndpoint({
  method: "post",
  path: "/user/login",
  module: "user/post_login",
  baseUrl: "https://api.example.com",
  wraps: [],
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

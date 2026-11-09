// 自動生成: comatype generate が作ったファイルです。手で編集しないでください
import { t, defineStatus, defineEndpoint, type Schema, type StatusFn, type Endpoint } from '@comatype/typescript'
import type { LogCtx, AuthCtx } from '../init'

export type Body = {
  theme: string;
}
export const Body: Schema<Body> = t.object({
  theme: t.string(),
})

export type Request = { body: Body }

export type S200 = { status: 200; data: {
    theme: string;
  } }
export const s200: StatusFn<S200, { data: {
    theme: string;
  } }> = defineStatus(200, t.object({
  theme: t.string(),
}), null)
export declare namespace s200 {
  type Res = {
    theme: string;
  }
}

export type S401 = { status: 401; error: {
    message: string;
  } }
export const s401: StatusFn<S401, { error: {
    message: string;
  } }> = defineStatus(401, t.object({
  message: t.string(),
}), null)
export declare namespace s401 {
  type Res = {
    message: string;
  }
}

export type Response = S200 | S401

export type Ctx = LogCtx & AuthCtx

export const endpoint: Endpoint<Request, Response, Ctx, "put"> = defineEndpoint({
  method: "put",
  path: "/app/settings",
  module: "app/put_settings",
  baseUrl: "https://wraps.example.com",
  wraps: ["log", "auth"],
  cookie: false,
  params: null,
  search: null,
  body: Body,
  requestHeaders: null,
  responses: [s200, s401],
})
/** Same value as `endpoint` (callers import it as `path`) */
export const path = endpoint

const _ep = { path, endpoint, s200, s401 }
type _Request = Request
type _Response = Response
type _Ctx = Ctx
type _Body = Body
declare namespace _ep {
  export type Request = _Request
  export type Response = _Response
  export type Ctx = _Ctx
  export type Body = _Body
}
export default _ep

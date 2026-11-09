// 自動生成: comatype generate が作ったファイルです。手で編集しないでください
import { t, defineStatus, defineEndpoint, type StatusFn, type Endpoint } from '@comatype/typescript'
import type { LogCtx, AuthCtx } from '../init'

export type Request = void

export type S200 = { status: 200; data: {
    name: string;
  } }
export const s200: StatusFn<S200, { data: {
    name: string;
  } }> = defineStatus(200, t.object({
  name: t.string(),
}), null)
export declare namespace s200 {
  type Res = {
    name: string;
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

export const endpoint: Endpoint<Request, Response, Ctx, "get"> = defineEndpoint({
  method: "get",
  path: "/app/me",
  module: "app/get_me",
  baseUrl: "https://wraps.example.com",
  wraps: ["log", "auth"],
  cookie: false,
  params: null,
  search: null,
  body: null,
  requestHeaders: null,
  responses: [s200, s401],
})
/** Same value as `endpoint` (callers import it as `path`) */
export const path = endpoint

const _ep = { path, endpoint, s200, s401 }
type _Request = Request
type _Response = Response
type _Ctx = Ctx
declare namespace _ep {
  export type Request = _Request
  export type Response = _Response
  export type Ctx = _Ctx
}
export default _ep

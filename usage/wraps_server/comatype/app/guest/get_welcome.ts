// 自動生成: comatype generate が作ったファイルです。手で編集しないでください
import { t, defineStatus, defineEndpoint, type StatusFn, type Endpoint } from '@comatype/typescript'
import type { LogCtx } from '../../init'

export type Request = void

export type S200 = { status: 200; data: {
    message: string;
  } }
export const s200: StatusFn<S200, { data: {
    message: string;
  } }> = defineStatus(200, t.object({
  message: t.string(),
}), null)
export declare namespace s200 {
  type Res = {
    message: string;
  }
}

export type Response = S200

export type Ctx = LogCtx

export const endpoint: Endpoint<Request, Response, Ctx, "get"> = defineEndpoint({
  method: "get",
  path: "/app/guest/welcome",
  module: "app/guest/get_welcome",
  baseUrl: "https://wraps.example.com",
  wraps: ["log"],
  cookie: false,
  params: null,
  search: null,
  body: null,
  requestHeaders: null,
  responses: [s200],
})
/** Same value as `endpoint` (callers import it as `path`) */
export const path = endpoint

const _ep = { path, endpoint, s200 }
type _Request = Request
type _Response = Response
type _Ctx = Ctx
declare namespace _ep {
  export type Request = _Request
  export type Response = _Response
  export type Ctx = _Ctx
}
export default _ep

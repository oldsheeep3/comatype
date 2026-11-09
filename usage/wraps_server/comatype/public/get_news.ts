// 自動生成: comatype generate が作ったファイルです。手で編集しないでください
import { t, defineStatus, defineEndpoint, type StatusFn, type Endpoint } from '@comatype/typescript'
import type { LogCtx, RatelimitCtx } from '../init'

export type Request = void

export type S200 = { status: 200; data: {
    items: string[];
  } }
export const s200: StatusFn<S200, { data: {
    items: string[];
  } }> = defineStatus(200, t.object({
  items: t.array(t.string()),
}), null)
export declare namespace s200 {
  type Res = {
    items: string[];
  }
}

export type S429 = { status: 429; error: {
    message: string;
  } }
export const s429: StatusFn<S429, { error: {
    message: string;
  } }> = defineStatus(429, t.object({
  message: t.string(),
}), null)
export declare namespace s429 {
  type Res = {
    message: string;
  }
}

export type Response = S200 | S429

export type Ctx = LogCtx & RatelimitCtx

export const endpoint: Endpoint<Request, Response, Ctx, "get"> = defineEndpoint({
  method: "get",
  path: "/public/news",
  module: "public/get_news",
  baseUrl: "https://wraps.example.com",
  wraps: ["log", "ratelimit"],
  cookie: false,
  cache: { mode: 'memory', ttlMs: 60000 },
  cacheHeaders: [],
  params: null,
  search: null,
  body: null,
  requestHeaders: null,
  responses: [s200, s429],
})
/** Same value as `endpoint` (callers import it as `path`) */
export const path = endpoint

const _ep = { path, endpoint, s200, s429 }
type _Request = Request
type _Response = Response
type _Ctx = Ctx
declare namespace _ep {
  export type Request = _Request
  export type Response = _Response
  export type Ctx = _Ctx
}
export default _ep

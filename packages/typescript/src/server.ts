// Server `s`: builds a Fetch API Request -> Response function from endpoint descriptors and handlers

import { cacheable, MemoryCache, serverCacheKey } from './cache.ts'
import type { WrappersInit } from './client.ts'
import type { CookieValue } from './cookie.ts'
import { setCookieLines } from './cookie.ts'
import type { Endpoint, Method, RawRequest, RawResponse, StatusFn } from './endpoint.ts'
import { BUILT } from './endpoint.ts'
import { ComatypeError } from './errors.ts'
import { ValidationError } from './schema.ts'
import { coerceObject, headerString, validateOut } from './wire.ts'

// ---- types ----

type Part<R, K extends string, Fallback> = K extends keyof R ? Exclude<R[K & keyof R], undefined> : Fallback

/** The request a handler receives. params / search / body / headers are already validated and converted */
export type HandlerRequest<R, Ctx> = {
  params: Part<R, 'params', {}>
  /** An empty object when there is no query */
  search: Part<R, 'search', {}>
  /** undefined for endpoints without a `body` */
  body: Part<R, 'body', undefined>
  headers: Part<R, 'headers', {}>
  cookies: Record<string, string | undefined>
  /** Values added by the active wrappers */
  ctx: Ctx
  method: string
  path: string
}

export type ServerMethod<M extends Method> = <Req, Res, Ctx>(
  endpoint: Endpoint<Req, Res, Ctx, M>,
  handler: (req: HandlerRequest<Req, Ctx>) => Res | Promise<Res>,
) => void

export type ServerInit = WrappersInit & {
  /** Exceptions thrown by handlers or wrappers. Default is console.error. The client gets a 500 */
  onError?: (error: unknown, request: Request) => void
}

export interface Server {
  init(config: ServerInit): void
  /** Takes a Fetch API Request and returns a Response. Works on Node, Bun, Deno and Workers (for Node use `@comatype/typescript/node`) */
  handle(request: Request): Promise<Response>
  get: ServerMethod<'get'>
  post: ServerMethod<'post'>
  put: ServerMethod<'put'>
  patch: ServerMethod<'patch'>
  delete: ServerMethod<'delete'>
  options: ServerMethod<'options'>
  query: ServerMethod<'query'>
  head: ServerMethod<'head'>
}

// ---- implementation ----

interface Route {
  ep: Endpoint<any, any, any>
  handler: (req: any) => unknown
  segs: string[]
  statics: number
}

const json = (status: number, body: unknown): RawResponse => ({ status, error: body })

const jsonResponse = (status: number, body: unknown, extra?: Record<string, string>): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } })

const pathSegs = (p: string) => p.split('/').filter(Boolean)

function parseCookies(header: string | null): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const name = part.slice(0, i).trim()
    if (!name || name in out) continue
    let v = part.slice(i + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    try {
      out[name] = decodeURIComponent(v)
    } catch {
      out[name] = v
    }
  }
  return out
}

/** Turn a TS-value response built by a handler/wrapper into its wire form (validated and encoded) */
function toWire(out: any, ep?: Endpoint<any, any, any>): RawResponse {
  const sf: StatusFn<any, any> | undefined = out?.[BUILT] ?? ep?.responses.find((r) => r.status === out?.status)
  if (!sf) {
    throw new ComatypeError(`s${out?.status} は${ep ? ` ${ep.module} に` : ''}宣言されていません（.comat に追加してください）`)
  }
  const wire: RawResponse = { status: sf.status }
  const body = out[sf.kind]
  if (sf.res && body !== undefined) wire[sf.kind] = validateOut(sf.res, body)
  if (sf.headers && out.headers) {
    const h = validateOut(sf.headers, out.headers) as Record<string, unknown>
    wire.headers = Object.fromEntries(
      Object.entries(h)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, headerString(v)]),
    )
  }
  if (out.cookie) wire.cookies = setCookieLines(ep?.cookieDef, out.cookie as Record<string, CookieValue | undefined>)
  return wire
}

const NO_BODY = new Set([101, 204, 205, 304])

function toResponse(raw: RawResponse): Response {
  const headers = new Headers()
  for (const [k, v] of Object.entries(raw.headers ?? {})) if (v !== undefined) headers.set(k, headerString(v))
  for (const line of raw.cookies ?? []) headers.append('set-cookie', line)
  const body = raw.data !== undefined ? raw.data : raw.error
  if (NO_BODY.has(raw.status) || body === undefined) return new Response(null, { status: raw.status, headers })
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(body), { status: raw.status, headers })
}

export function createServer(): Server {
  let config: { wrappers?: Record<string, any>; onError?: ServerInit['onError'] } = {}
  const routes: Route[] = []
  /** Responses of `cache <ttl>` (memory) endpoints; hit on an exact request match */
  const cache = new MemoryCache<RawResponse>()

  const register =
    (method: Method) =>
    (ep: Endpoint<any, any, any>, handler: (req: any) => unknown): void => {
      if (ep.method !== method) throw new ComatypeError(`s.${method}() に ${ep.method} のエンドポイント（${ep.module}）は渡せません`)
      const shape = (r: Pick<Route, 'segs'> & { ep: Endpoint }) =>
        `${r.ep.method} /${r.segs.map((x) => (x.startsWith(':') ? ':' : x)).join('/')}`
      const route: Route = {
        ep,
        handler,
        segs: pathSegs(ep.path),
        statics: pathSegs(ep.path).filter((x) => !x.startsWith(':')).length,
      }
      const dup = routes.find((r) => shape(r) === shape(route))
      if (dup) throw new ComatypeError(`${shape(route)} が重複しています（${dup.ep.module} と ${ep.module}）`)
      routes.push(route)
    }

  const find = (method: string, segs: string[]): { route: Route; params: Record<string, string> } | undefined => {
    let best: { route: Route; params: Record<string, string> } | undefined
    for (const route of routes) {
      if (route.ep.method !== method || route.segs.length !== segs.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < segs.length && ok; i++) {
        const want = route.segs[i]
        if (want.startsWith(':')) params[want.slice(1)] = segs[i]
        else if (want !== segs[i]) ok = false
      }
      if (ok && (!best || route.statics > best.route.statics)) best = { route, params }
    }
    return best
  }

  /** validate -> handler -> validate the response. The innermost layer, after the wrappers */
  const core = async (route: Route, r: RawRequest<any>, request: Request): Promise<RawResponse> => {
    const { ep } = route
    let req: HandlerRequest<any, any>
    try {
      req = {
        params: ep.params ? ep.params.parse(coerceObject(ep.params, r.params), 'params') : {},
        search: ep.search ? ep.search.parse(coerceObject(ep.search, r.search), 'search') : {},
        body: ep.body ? ep.body.parse(r.body, 'body') : undefined,
        headers: ep.requestHeaders ? ep.requestHeaders.parse(coerceObject(ep.requestHeaders, r.headers, true), 'headers') : {},
        cookies: r.cookies,
        ctx: r.ctx,
        method: r.method,
        path: r.path,
      }
    } catch (e) {
      if (e instanceof ValidationError) return json(400, { code: 'validation_error', message: e.message, path: e.path })
      throw e
    }
    const out = await route.handler(req)
    try {
      return toWire(out, ep)
    } catch (e) {
      if (e instanceof ValidationError) {
        // The server's own error (it returned a response that does not match the .comat). The details are not shown to the client
        if (config.onError) config.onError(e, request)
        else console.error(`[comatype] ${ep.module}: レスポンスが .comat に合いません: ${e.message}`)
        return json(500, { code: 'internal_error', message: 'Internal Server Error' })
      }
      throw e
    }
  }

  const server: Server = {
    init(c) {
      config = { wrappers: (c as any).wrappers, onError: c.onError }
    },

    async handle(request) {
      try {
        const url = new URL(request.url)
        const method = request.method.toLowerCase()
        let segs: string[]
        try {
          segs = pathSegs(url.pathname).map(decodeURIComponent)
        } catch {
          return jsonResponse(400, { code: 'bad_request', message: 'path が不正です' })
        }
        const hit = find(method, segs)
        if (!hit) {
          const allow = [...new Set(routes.filter((r) => find(r.ep.method, segs)).map((r) => r.ep.method.toUpperCase()))]
          if (allow.length)
            return jsonResponse(
              405,
              { code: 'method_not_allowed', message: `使えるメソッド: ${allow.join(', ')}` },
              { allow: allow.join(', ') },
            )
          return jsonResponse(404, { code: 'not_found', message: url.pathname })
        }
        const { route } = hit
        const { ep } = route

        const wraps = ep.wraps.map((name) => {
          const w = config.wrappers?.[name]
          if (!w) throw new ComatypeError(`ラッパー ${name} が init に渡されていません（${ep.module}）`)
          return w
        })

        const text = await request.text()
        // Cache (GET / QUERY, memory only; cookie caching is client-only). Looked up before wrappers, so the key includes all headers (auth too)
        const cacheKey =
          ep.cache?.mode === 'memory' && ep.cache.ttlMs
            ? serverCacheKey(method, url.pathname + url.search, Object.fromEntries(request.headers.entries()), text)
            : undefined
        if (cacheKey) {
          const hit = cache.get(cacheKey)
          if (hit) return toResponse(structuredClone(hit))
        }
        let body: unknown
        if (text !== '') {
          try {
            body = JSON.parse(text)
          } catch {
            return jsonResponse(400, { code: 'invalid_json', message: 'ボディが JSON ではありません' })
          }
        }
        const search: Record<string, string | string[] | undefined> = {}
        for (const k of new Set(url.searchParams.keys())) {
          const all = url.searchParams.getAll(k)
          search[k] = all.length === 1 ? all[0] : all
        }
        const raw: RawRequest<any> = {
          method,
          path: url.pathname,
          headers: Object.fromEntries(request.headers.entries()),
          cookies: parseCookies(request.headers.get('cookie')),
          params: hit.params,
          search,
          body,
          ctx: {},
        }

        // Wrappers run outermost to innermost. Every layer sees the response in wire form
        const normalize = (res: RawResponse): RawResponse => ((res as any)?.[BUILT] ? toWire(res, ep) : res)
        let next = (r: RawRequest<any>) => core(route, r, request)
        for (const w of [...wraps].reverse()) {
          const inner = next
          next = async (r) => normalize(await w(r, inner))
        }
        const result = normalize(await next(raw))
        if (cacheKey && cacheable(result)) cache.set(cacheKey, structuredClone(result), ep.cache!.ttlMs!)
        return toResponse(result)
      } catch (e) {
        if (config.onError) config.onError(e, request)
        else console.error('[comatype]', e)
        return jsonResponse(500, { code: 'internal_error', message: 'Internal Server Error' })
      }
    },

    get: register('get') as ServerMethod<'get'>,
    post: register('post') as ServerMethod<'post'>,
    put: register('put') as ServerMethod<'put'>,
    patch: register('patch') as ServerMethod<'patch'>,
    delete: register('delete') as ServerMethod<'delete'>,
    options: register('options') as ServerMethod<'options'>,
    query: register('query') as ServerMethod<'query'>,
    head: register('head') as ServerMethod<'head'>,
  }
  return server
}

/** Default server.`import { s } from '@comatype/typescript'` */
export const s: Server = createServer()

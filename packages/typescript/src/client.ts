// Client `c`: builds typed fetch calls from endpoint descriptors and status functions

import { BUILT } from './endpoint.ts'
import type { ComatypeWrap, Endpoint, Method, RawRequest, RawResponse, StatusFn } from './endpoint.ts'
import type { CookieJar } from './cookie.ts'
import { CACHE_COOKIE_PREFIX, MemoryCache, cacheable, clientCacheKey, decodeCacheCookie, encodeCacheCookie, fnv1a } from './cache.ts'
import { ComatypeError, UnexpectedStatusError } from './errors.ts'
import type { RegisteredWrappers } from './index.ts'
import { coerceObject, headerString, toWireString, validateOut } from './wire.ts'

// ---- types ----

type Statuses = readonly StatusFn<any, any>[]

/** `const { status, data, error } = await c.post(...)` so it can be destructured, add missing keys as `undefined` */
type Widen<O> = O extends unknown ? O & { [K in Exclude<'data' | 'error' | 'headers', keyof O>]?: undefined } : never

/** Union of the responses for the statuses passed (s200, s404, ...) */
export type Result<S extends Statuses> = Widen<ReturnType<S[number]>>

/**
 * How to pass the request (decided by the shape of the endpoint Request):
 *   no params / search / body -> no argument:           c.get(path, s200)
 *   body only                  -> pass the body as is: c.post(path, body, s200)
 *   search only, all optional -> the argument can be omitted: c.get(path, s200) / c.get(path, { search }, s200)
 *   anything else              -> an object { params, search, body }
 * headers is part of Request but is not passed here (set it via init headers or `c.with({ headers })`)
 */
type NoReq = void | { params?: never; search?: never; body?: never; headers?: any }
type BodyReq = { body: any; params?: never; search?: never; headers?: any }
type OptSearchReq = { search?: any; params?: never; body?: never; headers?: any }
type AnyReq = { params?: any; search?: any; body?: any; headers?: any }

/** When search is required, make it never so it does not match the "omit the whole argument" overload */
type SearchIsOptional<R> = R extends { search: any } ? never : unknown

export interface ClientMethod<M extends Method> {
  <R extends NoReq, Res, S extends Statuses>(endpoint: Endpoint<R, Res, any, M>, ...statuses: S): Promise<Result<S>>
  <R extends BodyReq, Res, S extends Statuses>(
    endpoint: Endpoint<R, Res, any, M>,
    body: R['body'],
    ...statuses: S
  ): Promise<Result<S>>
  <R extends OptSearchReq, Res, S extends Statuses>(
    endpoint: Endpoint<R, Res, any, M> & SearchIsOptional<R>,
    ...statuses: S
  ): Promise<Result<S>>
  <R extends AnyReq, Res, S extends Statuses>(
    endpoint: Endpoint<R, Res, any, M>,
    request: R,
    ...statuses: S
  ): Promise<Result<S>>
}

export type WrappersInit = {} extends RegisteredWrappers
  ? { wrappers?: RegisteredWrappers }
  : { wrappers: RegisteredWrappers }

export type ClientInit = WrappersInit & {
  /** Precedence: this option > env COMATYPE_BASE_URL > baseUrl in init.comat */
  baseUrl?: string
  /** Passed to fetch for `cookie on` endpoints. Cookies are httpOnly, so JS cannot read them */
  cookie?: {
    credentials?: RequestCredentials
    /** For environments that do not keep cookies (Node etc.). Pass `createCookieJar()` */
    jar?: CookieJar
  }
  /** Headers added to every request */
  headers?: Record<string, string>
  fetch?: typeof fetch
}

export type ClientConfig = {
  baseUrl?: string
  wrappers?: Record<string, ComatypeWrap<any>>
  cookie?: { credentials?: RequestCredentials; jar?: CookieJar }
  headers?: Record<string, string>
  fetch?: typeof fetch
}

export interface Client {
  init(config: ClientInit): void
  /** Discard the cache (memory and entries stored in cookies), e.g. on logout */
  clearCache(): void
  /** A new client with extra headers / signal for this client only (settings are shared with the original client) */
  with(options: { headers?: Record<string, string>; signal?: AbortSignal }): Client
  get: ClientMethod<'get'>
  post: ClientMethod<'post'>
  put: ClientMethod<'put'>
  patch: ClientMethod<'patch'>
  delete: ClientMethod<'delete'>
  options: ClientMethod<'options'>
  query: ClientMethod<'query'>
  head: ClientMethod<'head'>
}

// ---- implementation ----

interface Extra {
  headers: Record<string, string>
  signal?: AbortSignal
}

/** Remove cache cookies from the jar (they are not sent back to the server) */
const withoutCacheCookies = (c: Record<string, string | undefined>): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith(CACHE_COOKIE_PREFIX)))

/** Read a cache stored in a cookie. Browsers use document.cookie, others use the cookie jar */
function readCacheCookie(cfg: ClientConfig, name: string): RawResponse | undefined {
  const doc = (globalThis as { document?: { cookie: string } }).document
  let value: string | undefined
  if (doc) value = doc.cookie.split(';').map((p) => p.trim().split('=')).find(([k]) => k === name)?.[1]
  else value = cfg.cookie?.jar?.get('/')[name]
  return value ? decodeCacheCookie(value) : undefined
}

/** Write a cache to a cookie (ttl rounded up to seconds). Returns true if written. Nothing is written without a jar or document */
function writeCacheCookie(cfg: ClientConfig, name: string, res: RawResponse, ttlMs: number): boolean {
  const value = encodeCacheCookie(res)
  if (!value) return false
  const maxAge = Math.max(1, Math.ceil(ttlMs / 1000))
  const doc = (globalThis as { document?: { cookie: string } }).document
  if (doc) {
    doc.cookie = `${name}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax`
    return true
  }
  if (!cfg.cookie?.jar) return false
  cfg.cookie.jar.store([`${name}=${value}; Max-Age=${maxAge}; Path=/`])
  return true
}

const isStatusFn = (x: unknown): x is StatusFn<any, any> =>
  typeof x === 'function' && typeof (x as any).status === 'number' && 'kind' in x

const env = (name: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]

interface Root {
  config: ClientConfig
  cache?: MemoryCache<RawResponse>
  /** Names of cache cookies (for clearCache) */
  cacheCookies?: Set<string>
}

export function createClient(root: Root = { config: {} }, extra: Extra = { headers: {} }): Client {
  const clearCache = (): void => {
    root.cache?.clear()
    const jar = root.config.cookie?.jar
    const doc = (globalThis as { document?: { cookie: string } }).document
    for (const name of root.cacheCookies ?? []) {
      if (doc) doc.cookie = `${name}=; Max-Age=0; Path=/`
      else jar?.store([`${name}=; Max-Age=0; Path=/`])
    }
    root.cacheCookies?.clear()
  }
  const call =
    (method: string) =>
    async (ep: Endpoint<any, any>, ...args: unknown[]): Promise<any> => {
      if (ep.method !== method) {
        throw new ComatypeError(`c.${method}() に ${ep.method} のエンドポイント（${ep.module}）は渡せません`)
      }
      const cfg = root.config
      let i = 0
      while (i < args.length && !isStatusFn(args[i])) i++
      const reqArgs = args.slice(0, i)
      const statuses = args.slice(i) as StatusFn<any, any>[]
      if (reqArgs.length > 1) throw new ComatypeError('リクエストの引数が多すぎます')
      const req: any = reqArgs.length === 0 ? {} : ep.params || ep.search ? reqArgs[0] : { body: reqArgs[0] }

      // check that all wrappers are present before building the request
      const wraps = ep.wraps.map((name) => {
        const w = cfg.wrappers?.[name]
        if (!w) throw new ComatypeError(`ラッパー ${name} が init に渡されていません（${ep.module}）`)
        return w
      })

      // validate before sending (params / search / headers / body)
      const paramsWire = ep.params ? (validateOut(ep.params, req.params ?? {}) as Record<string, unknown>) : {}
      const path = ep.path.replace(/:([A-Za-z0-9_-]+)/g, (_, name: string) => {
        if (paramsWire[name] === undefined) throw new ComatypeError(`path の :${name} に値がありません`)
        return encodeURIComponent(toWireString(paramsWire[name]))
      })
      const searchWire = ep.search ? (validateOut(ep.search, req.search ?? {}) as Record<string, unknown>) : {}
      const search: Record<string, string | string[] | undefined> = {}
      for (const [k, v] of Object.entries(searchWire)) {
        if (v === undefined || v === null) continue
        search[k] = Array.isArray(v) ? v.map(toWireString) : toWireString(v)
      }
      let body: unknown
      if (ep.body) {
        if (req.body === undefined) throw new ComatypeError('body が必要です')
        body = validateOut(ep.body, req.body)
      }
      const headers: Record<string, string | undefined> = { accept: 'application/json', ...cfg.headers, ...extra.headers }
      if (ep.requestHeaders) {
        const hw = validateOut(ep.requestHeaders, req.headers ?? {}) as Record<string, unknown>
        for (const [k, v] of Object.entries(hw)) if (v !== undefined && v !== null) headers[k] = headerString(v)
      }
      if (body !== undefined) headers['content-type'] = 'application/json'

      const raw: RawRequest<any> = {
        method,
        path,
        headers,
        cookies: ep.cookie && cfg.cookie?.jar ? withoutCacheCookies(cfg.cookie.jar.get(path)) : {},
        params: Object.fromEntries(Object.entries(paramsWire).map(([k, v]) => [k, toWireString(v)])),
        search,
        body,
        ctx: {},
      }

      const send = async (r: RawRequest<any>): Promise<RawResponse> => {
        const base = cfg.baseUrl ?? env('COMATYPE_BASE_URL') ?? ep.baseUrl
        if (!base) throw new ComatypeError('base url がありません（init の baseUrl か COMATYPE_BASE_URL、init.comat の baseUrl のどれかで指定してください）')
        const qs = new URLSearchParams()
        for (const [k, v] of Object.entries(r.search)) {
          if (v === undefined) continue
          for (const x of Array.isArray(v) ? v : [v]) qs.append(k, x)
        }
        const url = base.replace(/\/+$/, '') + r.path + (qs.size ? `?${qs}` : '')
        const h = new Headers()
        for (const [k, v] of Object.entries(r.headers)) if (v !== undefined) h.set(k, v)
        // turn r.cookies, including cookies added by wrappers, into a Cookie header (a directly specified header takes precedence)
        const pairs = Object.entries(r.cookies).filter(([, v]) => v !== undefined)
        if (ep.cookie && pairs.length && !h.has('cookie')) {
          h.set('cookie', pairs.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('; '))
        }
        // Cache (GET / QUERY): memory or cookie. The key is method, URL, body and the declared request headers
        const cacheMode = ep.cache && ep.cache.mode !== 'off' && ep.cache.ttlMs ? ep.cache.mode : undefined
        const cacheKey = cacheMode ? clientCacheKey(r.method, url, r.body, ep.cacheHeaders, r.headers) : undefined
        if (cacheKey) {
          const hit = cacheMode === 'memory' ? root.cache?.get(cacheKey) : readCacheCookie(cfg, CACHE_COOKIE_PREFIX + fnv1a(cacheKey))
          if (hit) return structuredClone(hit)
        }
        const res = await (cfg.fetch ?? globalThis.fetch)(url, {
          method: r.method.toUpperCase(),
          headers: h,
          body: r.body === undefined ? undefined : JSON.stringify(r.body),
          credentials: ep.cookie ? cfg.cookie?.credentials : undefined,
          signal: extra.signal,
        })
        const text = await res.text()
        let parsed: unknown = undefined
        if (text !== '') {
          try {
            parsed = JSON.parse(text)
          } catch {
            parsed = text
          }
        }
        const out: RawResponse = { status: res.status, headers: Object.fromEntries(res.headers.entries()) }
        const setCookies = res.headers.getSetCookie?.() ?? []
        if (setCookies.length) {
          out.cookies = setCookies
          if (ep.cookie) cfg.cookie?.jar?.store(setCookies)
        }
        if (res.status >= 200 && res.status < 300) out.data = parsed
        else out.error = parsed
        if (cacheKey && cacheable(out)) {
          const ttl = ep.cache!.ttlMs!
          if (cacheMode === 'memory') (root.cache ??= new MemoryCache()).set(cacheKey, structuredClone(out), ttl)
          else {
            const name = CACHE_COOKIE_PREFIX + fnv1a(cacheKey)
            if (writeCacheCookie(cfg, name, out, ttl)) (root.cacheCookies ??= new Set()).add(name)
          }
        }
        return out
      }

      // wraps is outermost to innermost; the innermost is send
      let next = send
      for (const w of [...wraps].reverse()) {
        const inner = next
        next = (r) => w(r, inner)
      }
      const res = await next(raw)
      if ((res as any)[BUILT]) return res

      const sf = statuses.find((s) => s.status === res.status)
      if (!sf) throw new UnexpectedStatusError(res.status, res.data ?? res.error)
      const out: Record<string, unknown> = { status: sf.status }
      if (sf.res) out[sf.kind] = sf.res.parse(res[sf.kind], sf.kind)
      if (sf.headers) {
        const src = (res.headers ?? {}) as Record<string, string | string[] | undefined>
        out.headers = sf.headers.parse(coerceObject(sf.headers, src, true), 'headers')
      }
      return out
    }

  return {
    init(config) {
      root.config = { ...config } as ClientConfig
    },
    clearCache,
    with(options) {
      return createClient(root, {
        headers: { ...extra.headers, ...options.headers },
        signal: options.signal ?? extra.signal,
      })
    },
    get: call('get') as ClientMethod<'get'>,
    post: call('post') as ClientMethod<'post'>,
    put: call('put') as ClientMethod<'put'>,
    patch: call('patch') as ClientMethod<'patch'>,
    delete: call('delete') as ClientMethod<'delete'>,
    options: call('options') as ClientMethod<'options'>,
    query: call('query') as ClientMethod<'query'>,
    head: call('head') as ClientMethod<'head'>,
  }
}

/** Default client.`import { c } from '@comatype/typescript'` */
export const c: Client = createClient()

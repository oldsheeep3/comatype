import type { CacheSpec } from './cache.ts'
import type { CookieDef } from './cookie.ts'
import type { Schema } from './schema.ts'

/** Marker for responses built by `s200()` etc. The value is the status function that built it. It is still a TS value, so it needs encode before going on the wire */
export const BUILT: unique symbol = Symbol('comatype.built')

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'query' | 'head'

/** A function that builds a status response, like `s200` */
export interface StatusFn<Out, Init> {
  (...args: [Init] extends [void] ? [] : {} extends Init ? [init?: Init] : [init: Init]): Out
  readonly status: number
  /** The body goes in 'data' for 2xx and in 'error' otherwise */
  readonly kind: 'data' | 'error'
  /** null when `none` */
  readonly res: Schema<any> | null
  /** s200.headers: schema of the headers */
  readonly headers: Schema<any> | null
}

export function defineStatus<Out, Init = void>(
  status: number,
  res: Schema<any> | null,
  headers: Schema<any> | null = null,
): StatusFn<Out, Init> {
  const kind = status >= 200 && status < 300 ? 'data' : 'error'
  const fn = (init?: { data?: unknown; error?: unknown; headers?: unknown; cookie?: unknown }) => {
    const out: Record<string, unknown> = { status }
    if (res) out[kind] = init?.[kind]
    if (init?.headers !== undefined) out.headers = init.headers
    if (init?.cookie !== undefined) out.cookie = init.cookie
    Object.defineProperty(out, BUILT, { value: sf })
    return out
  }
  const sf = Object.assign(fn, { status, kind, res, headers }) as unknown as StatusFn<Out, Init>
  return sf
}

/** Endpoint descriptor. The `endpoint` of generated code (`path` is the same value). Carries the types Req / Res */
export interface Endpoint<Req = unknown, Res = unknown, Ctx = any, M extends Method = Method> {
  readonly method: M
  readonly path: string
  readonly module: string
  /** baseUrl from init.comat (can be overridden at runtime by `COMATYPE_BASE_URL` or init) */
  readonly baseUrl?: string
  /** outermost to innermost */
  readonly wraps: readonly string[]
  readonly cookie: boolean
  /** `cache` setting (GET / QUERY only; if absent, no caching) */
  readonly cache?: CacheSpec
  /** Names of declared request headers that go into the client cache key */
  readonly cacheHeaders?: readonly string[]
  /** With `cookie on`, when init.comat declares a cookie */
  readonly cookieDef?: CookieDef
  readonly params: Schema<any> | null
  readonly search: Schema<any> | null
  readonly body: Schema<any> | null
  readonly requestHeaders: Schema<any> | null
  readonly responses: readonly StatusFn<any, any>[]
  /** type-only marker (not present at runtime) */
  readonly __types?: { req: Req; res: Res; ctx: Ctx }
}

export function defineEndpoint<Req, Res, Ctx = {}, M extends Method = Method>(
  def: Omit<Endpoint<Req, Res, Ctx, M>, '__types'>,
): Endpoint<Req, Res, Ctx, M> {
  return def
}

/** Raw request seen by wrappers, with no per-endpoint types */
export interface RawRequest<Ctx = {}> {
  method: string
  path: string
  headers: Record<string, string | undefined>
  cookies: Record<string, string | undefined>
  params: Record<string, string>
  search: Record<string, string | string[] | undefined>
  body: unknown
  ctx: Ctx
}

export interface RawResponse {
  status: number
  data?: unknown
  error?: unknown
  headers?: Record<string, unknown>
  /** Set-Cookie lines (cookies to emit; built by the server, and the client stores the lines it received) */
  cookies?: string[]
}

/**
 * Wrapper implementation. Calling `next` moves inward. Both request and response can be rewritten.
 * ctx is a value that wrappers add, so inside a wrapper it is treated as Partial (it may not exist yet).
 * This lets a wrapper that does not use ctx (`ComatypeWrap`) also fit a `ComatypeWrap<AuthCtx>` slot
 */
export type ComatypeWrap<Ctx = {}> = (
  req: RawRequest<Partial<Ctx>>,
  next: (req: RawRequest<Partial<Ctx>>) => Promise<RawResponse>,
) => Promise<RawResponse>

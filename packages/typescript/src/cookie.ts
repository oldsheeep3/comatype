// cookie: emitting Set-Cookie (server) and keeping received cookies (client)

import { ComatypeError } from './errors.ts'
import type { ComatypeRegistry } from './index.ts'

/** `cookie <name> { ... }` from init.comat. Placed in the generated endpoint */
export interface CookieDef {
  name: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  path?: string
  domain?: string
  /** seconds */
  maxAge?: number
}

/** What can be overridden on each emit (the httpOnly / secure / sameSite attributes are fixed in init.comat) */
export interface CookieOptions {
  /** seconds */
  maxAge?: number
  expires?: Date
  path?: string
  domain?: string
}

/** string = emit with that value, object = value plus expiry etc., null = delete */
export type CookieValue = string | ({ value: string } & CookieOptions) | null

/** `s200({ data, cookie: { session: token } })`。The key is a cookie name declared in init.comat */
export type CookieInit = ComatypeRegistry extends { cookies: infer N extends string } ? { [K in N]?: CookieValue } : {}

const EPOCH = 'Thu, 01 Jan 1970 00:00:00 GMT'
const BAD_ATTR = /[;\r\n]/

const attr = (what: string, v: string): string => {
  if (BAD_ATTR.test(v)) throw new ComatypeError(`cookie の ${what} に使えない文字があります: ${JSON.stringify(v)}`)
  return v
}

/** Build a Set-Cookie header value */
export function serializeSetCookie(def: CookieDef, value: CookieValue): string {
  const opts: CookieOptions & { value?: string } = value === null || typeof value === 'string' ? {} : value
  const v = value === null ? '' : typeof value === 'string' ? value : value.value
  const parts = [`${def.name}=${encodeURIComponent(v)}`]
  parts.push(`Path=${attr('path', opts.path ?? def.path ?? '/')}`)
  const domain = opts.domain ?? def.domain
  if (domain) parts.push(`Domain=${attr('domain', domain)}`)
  if (value === null) {
    parts.push('Max-Age=0', `Expires=${EPOCH}`)
  } else {
    const maxAge = opts.maxAge ?? def.maxAge
    if (maxAge !== undefined) {
      if (!Number.isInteger(maxAge) || maxAge < 0) throw new ComatypeError(`cookie の maxAge が不正です: ${maxAge}`)
      parts.push(`Max-Age=${maxAge}`)
    }
    if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`)
  }
  if (def.httpOnly) parts.push('HttpOnly')
  if (def.secure) parts.push('Secure')
  if (def.sameSite) parts.push(`SameSite=${def.sameSite[0].toUpperCase()}${def.sameSite.slice(1)}`)
  return parts.join('; ')
}

/** Turn `cookie: { ... }` into Set-Cookie lines. An undeclared name is an error */
export function setCookieLines(def: CookieDef | undefined, cookie: Record<string, CookieValue | undefined>): string[] {
  const lines: string[] = []
  for (const [name, v] of Object.entries(cookie)) {
    if (v === undefined) continue
    if (!def)
      throw new ComatypeError(
        `cookie ${name} を発行できません（このエンドポイントは cookie off、または init.comat に cookie の宣言がありません）`,
      )
    if (name !== def.name) throw new ComatypeError(`cookie ${name} は init.comat に宣言されていません（${def.name}）`)
    lines.push(serializeSetCookie(def, v))
  }
  return lines
}

// ---- client cookie jar ----

interface Stored {
  value: string
  path: string
  /** ms; no value means a session cookie */
  expires?: number
}

export interface CookieJar {
  /** Cookies to send for this path (expired ones excluded) */
  get(path: string): Record<string, string>
  /** Take in Set-Cookie from a response (Max-Age=0 / expired deletes) */
  store(setCookies: readonly string[]): void
  clear(): void
}

/**
 * A jar that assumes the API lives on a single origin. Ignores Domain; only Path and expiry are checked.
 * Not used in browsers (use `credentials: 'include'` and leave it to the browser). For environments that do not keep cookies, such as Node
 */
export function createCookieJar(now: () => number = Date.now): CookieJar {
  const jar = new Map<string, Stored>()
  return {
    get(path) {
      const out: Record<string, string> = {}
      for (const [name, c] of jar) {
        if (c.expires !== undefined && c.expires <= now()) {
          jar.delete(name)
          continue
        }
        const ok = c.path === '/' || path === c.path || path.startsWith(c.path.endsWith('/') ? c.path : `${c.path}/`)
        if (ok) out[name] = c.value
      }
      return out
    },
    store(lines) {
      for (const line of lines) {
        const [pair, ...attrs] = line.split(';').map((x) => x.trim())
        const i = pair.indexOf('=')
        if (i <= 0) continue
        const name = pair.slice(0, i)
        let value = pair.slice(i + 1)
        try {
          value = decodeURIComponent(value)
        } catch {
          /* leave as is */
        }
        let path = '/'
        let expires: number | undefined
        let maxAge: number | undefined
        for (const a of attrs) {
          const j = a.indexOf('=')
          const k = (j < 0 ? a : a.slice(0, j)).toLowerCase()
          const v = j < 0 ? '' : a.slice(j + 1)
          if (k === 'path' && v.startsWith('/')) path = v
          else if (k === 'max-age' && /^-?\d+$/.test(v)) maxAge = Number(v)
          else if (k === 'expires' && !Number.isNaN(Date.parse(v))) expires = Date.parse(v)
        }
        if (maxAge !== undefined) expires = now() + maxAge * 1000 // Max-Age takes precedence over Expires
        if (expires !== undefined && expires <= now()) jar.delete(name)
        else jar.set(name, { value, path, expires })
      }
    },
    clear: () => jar.clear(),
  }
}

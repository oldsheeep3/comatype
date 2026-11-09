// Cache (`cache` in `.comat`): an in-memory TTL cache and the encoding used to store entries in cookies. Applies to GET / QUERY only

import type { RawResponse } from './endpoint.ts'

export interface CacheSpec {
  /** `off`: never cache / `memory`: keep in memory for ttlMs / `cookie`: keep in a cookie for ttlMs (client only) */
  mode: 'off' | 'memory' | 'cookie'
  ttlMs?: number
}

/** Name prefix of cache cookies. The client does not send cookies with this prefix back to the server */
export const CACHE_COOKIE_PREFIX = 'comatype_cache_'

/** Maximum size of one cookie (value length in characters). Larger responses are not cached in a cookie */
export const CACHE_COOKIE_MAX = 3800

/** In-memory cache with a ttl (expired entries are dropped on lookup; over the size limit, the oldest are dropped first) */
export class MemoryCache<T> {
  private map = new Map<string, { value: T; expires: number }>()
  private max: number
  private now: () => number

  constructor(max = 1000, now: () => number = Date.now) {
    this.max = max
    this.now = now
  }

  get(key: string): T | undefined {
    const e = this.map.get(key)
    if (!e) return undefined
    if (e.expires <= this.now()) {
      this.map.delete(key)
      return undefined
    }
    return e.value
  }

  set(key: string, value: T, ttlMs: number): void {
    this.map.delete(key)
    this.map.set(key, { value, expires: this.now() + ttlMs })
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string)
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}

/** Whether a response may be cached (2xx, no Set-Cookie) */
export function cacheable(res: RawResponse): boolean {
  return res.status >= 200 && res.status < 300 && !(res.cookies && res.cookies.length)
}

/** FNV-1a (64-bit) as hex. Used for cookie names */
export function fnv1a(s: string): string {
  let h = 0xcbf29ce484222325n
  for (const b of new TextEncoder().encode(s)) {
    h ^= BigInt(b)
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return h.toString(16).padStart(16, '0')
}

const b64url = (bytes: Uint8Array): string => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const unb64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Encode a response as a cookie value (base64url JSON). undefined if too large */
export function encodeCacheCookie(res: RawResponse): string | undefined {
  const v = b64url(new TextEncoder().encode(JSON.stringify({ s: res.status, h: res.headers, d: res.data })))
  return v.length <= CACHE_COOKIE_MAX ? v : undefined
}

export function decodeCacheCookie(value: string): RawResponse | undefined {
  try {
    const j = JSON.parse(new TextDecoder().decode(unb64url(value)))
    if (typeof j?.s !== 'number') return undefined
    const out: RawResponse = { status: j.s }
    if (j.h !== undefined) out.headers = j.h
    if (j.d !== undefined) out.data = j.d
    return out
  } catch {
    return undefined
  }
}

/**
 * Client cache key: method, URL (path and query) and body, plus the request headers declared in `.comat` (headerReq / header).
 * Headers added by wrappers or init (Authorization etc.) are not included
 */
export function clientCacheKey(
  method: string,
  url: string,
  body: unknown,
  declaredHeaders: readonly string[] | undefined,
  headers: Record<string, string | undefined>,
): string {
  const hs = (declaredHeaders ?? [])
    .map((n) => n.toLowerCase())
    .sort()
    .map((n) => `${n}:${headers[n] ?? ''}`)
    .join('\n')
  return `${method}\n${url}\n${hs}\n${body === undefined ? '' : JSON.stringify(body)}`
}

/** Server cache key: an exact match of the request (method, path, query, all headers, body) */
export function serverCacheKey(method: string, target: string, headers: Record<string, string | undefined>, bodyText: string): string {
  const hs = Object.keys(headers)
    .sort()
    .map((n) => `${n}:${headers[n] ?? ''}`)
    .join('\n')
  return `${method}\n${target}\n${hs}\n${bodyText}`
}

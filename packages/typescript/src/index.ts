export * from './schema.ts'
export * from './endpoint.ts'
export { c, createClient } from './client.ts'
export type { ClientConfig, ClientInit, Result } from './client.ts'
export { s, createServer } from './server.ts'
export type { Server, ServerInit, ServerMethod, HandlerRequest } from './server.ts'
export { createCookieJar, serializeSetCookie } from './cookie.ts'
export type { CookieDef, CookieInit, CookieJar, CookieOptions, CookieValue } from './cookie.ts'
export { MemoryCache } from './cache.ts'
export type { CacheSpec } from './cache.ts'
export { ComatypeError, UnexpectedStatusError } from './errors.ts'

import type { ComatypeWrap } from './endpoint.ts'

/**
 * The generated init.ts adds `wrappers` here via `declare module '@comatype/typescript'`.
 * This lets `c.init({ wrappers })` check the wrappers declared in init.comat for missing/extra entries and types
 */
export interface ComatypeRegistry {}

export type RegisteredWrappers = ComatypeRegistry extends { wrappers: infer W } ? W : Record<string, ComatypeWrap<any>>

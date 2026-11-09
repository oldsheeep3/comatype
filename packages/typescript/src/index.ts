export type { CacheSpec } from './cache.ts'
export { MemoryCache } from './cache.ts'
export type { ClientConfig, ClientInit, Result } from './client.ts'
export { c, createClient } from './client.ts'
export type { CookieDef, CookieInit, CookieJar, CookieOptions, CookieValue } from './cookie.ts'
export { createCookieJar, serializeSetCookie } from './cookie.ts'
export * from './endpoint.ts'
export { ComatypeError, UnexpectedStatusError } from './errors.ts'
export * from './schema.ts'
export type { HandlerRequest, Server, ServerInit, ServerMethod } from './server.ts'
export { createServer, s } from './server.ts'

import type { ComatypeWrap } from './endpoint.ts'

/**
 * The generated init.ts adds `wrappers` here via `declare module '@comatype/typescript'`.
 * This lets `c.init({ wrappers })` check the wrappers declared in init.comat for missing/extra entries and types
 */
export interface ComatypeRegistry {}

export type RegisteredWrappers = ComatypeRegistry extends { wrappers: infer W } ? W : Record<string, ComatypeWrap<any>>

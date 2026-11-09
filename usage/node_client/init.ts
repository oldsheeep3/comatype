// Client init file: import and pass the implemented ComatypeWrap
// The base url defaults to baseUrl in init.comat. Override with the COMATYPE_BASE_URL environment variable or the baseUrl below
import { c, createCookieJar } from '@comatype/typescript'
import { auth } from './wrappers/auth'

export function initComatype(baseUrl?: string) {
  // Node keeps no cookies, so take Set-Cookie into the jar and send it back with the next `cookie on` request
  // (In browsers, use `cookie: { credentials: 'include' }` instead of the jar)
  const jar = createCookieJar()
  c.init({
    baseUrl,
    // With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a compile error
    wrappers: { auth },
    cookie: { jar },
  })
  return { jar }
}

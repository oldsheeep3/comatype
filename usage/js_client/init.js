// Client init file: import and pass the implemented wrapper
// The base url defaults to baseUrl in init.comat. Override with the COMATYPE_BASE_URL environment variable or the baseUrl below
import { c, createCookieJar } from '@comatype/javascript'
import { auth } from './wrappers/auth.js'

export function initComatype(baseUrl) {
  // Node keeps no cookies, so take Set-Cookie into the jar and send it back with the next `cookie on` request
  const jar = createCookieJar()
  c.init({ baseUrl, wrappers: { auth }, cookie: { jar } })
  return { jar }
}

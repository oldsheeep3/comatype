// Implement a wrapper as a value of type ComatypeWrap and export it (corresponds to the `wrapper auth` of init.comat)
import type { ComatypeWrap } from '@comatype/typescript'

export const CLIENT_VERSION = '1.0.0'

// A wrapper receives the request and `next` and returns a response (both can be rewritten)
// The session travels in a cookie (kept and sent by the cookie.jar of init), so only headers common to every request are added here
export const auth: ComatypeWrap = async (req, next) => {
  // headerReq / header (X-Client-Version / X-Request-Id) of defaults.comat
  req.headers['x-client-version'] = CLIENT_VERSION
  req.headers['x-request-id'] ??= crypto.randomUUID()
  return next(req)
}

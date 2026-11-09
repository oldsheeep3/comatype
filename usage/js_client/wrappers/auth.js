// Implement a wrapper as a function (req, next) and export it (corresponds to the `wrapper auth` of init.comat)

/** @type {import('@comatype/javascript').ComatypeWrap} */
export const auth = async (req, next) => {
  // headerReq / header (X-Client-Version / X-Request-Id) of defaults.comat
  req.headers['x-client-version'] = '1.0.0'
  req.headers['x-request-id'] ??= crypto.randomUUID()
  return next(req)
}

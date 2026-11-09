// Implement a wrapper as a function (req, next) and export it (corresponds to the `wrapper auth` of init.comat)
// Generated from init.comat: the statuses a wrapper can return (s401)
import { s401 } from '../comatype/init.js'
import { db } from '../db.js' // the app's own storage

export const auth = async (req, next) => {
  // A session cookie (browsers) or Authorization: Bearer (other clients)
  const bearer = req.headers.authorization?.replace(/^Bearer /i, '')
  const user = db.bySession(req.cookies.session ?? bearer)
  if (!user) {
    return s401({ error: { code: 'unauthorized', message: 'login required' } })
  }
  // On endpoints with `wrap auth` on, a handler can read req.ctx.user
  return next({ ...req, ctx: { ...req.ctx, user } })
}

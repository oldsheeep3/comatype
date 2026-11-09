// Implement a wrapper as a value of type ComatypeWrap and export it (corresponds to the `wrapper auth` of init.comat)
import type { ComatypeWrap } from '@comatype/typescript'
// Generated from init.comat: the ctx type (AuthCtx) and the statuses a wrapper can return (s401)
import { s401, type AuthCtx } from '@/comatype/init'
import { db } from '../db'

// ComatypeWrap<AuthCtx>: the type of values that can be added to ctx. On endpoints with `wrap auth` on, a handler can read req.ctx.user, typed
export const auth: ComatypeWrap<AuthCtx> = async (req, next) => {
  // A session cookie (browsers) or Authorization: Bearer (other clients)
  const bearer = req.headers.authorization?.replace(/^Bearer /i, '')
  const user = db.bySession(req.cookies.session ?? bearer)
  if (!user) {
    return s401({ error: { code: 'unauthorized', message: 'login required' } })
  }
  return next({ ...req, ctx: { ...req.ctx, user } })
}

import { s } from '@comatype/typescript'
import { path, s204, s404 } from '@/comatype/user/delete__id'
import { db } from './db'

s.delete(path, (req) => {
  if (!db.remove(req.params.id)) {
    return s404({ error: { code: 'not_found', message: 'user not found' } })
  }
  // The body is none, so no arguments
  return s204()
})

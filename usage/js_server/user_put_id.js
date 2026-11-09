import { s } from '@comatype/javascript'
import { path, s200, s404 } from './comatype/user/put__id.js'
import { db } from './db.js' // the app's own storage

s.put(path, (req) => {
  // req.params.id: string, req.body: UserData
  const version = db.update(req.params.id, req.body)
  if (version === undefined) {
    return s404({ error: { code: 'not_found', message: 'user not found' } })
  }
  // headerRes (X-Resource-Version) of user/defaults.comat
  return s200({ data: db.find(req.params.id), headers: { 'X-Resource-Version': `v${version}` } })
})

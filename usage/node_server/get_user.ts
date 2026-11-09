import { s } from '@comatype/typescript'
import { path, s200, s404 } from '@/comatype/get_user'
import { db } from './db'

s.get(path, (req) => {
  // req.params.id: string (uuidv4), req.search.verbose: boolean | undefined
  const user = db.find(req.params.id)
  if (!user) {
    // Anything other than 2xx is error
    return s404({ error: { code: 'not_found', message: 'user not found' } })
  }
  // With verbose, return the request's X-Request-Id as is (a sample of a header round trip)
  const id = req.headers['X-Request-Id']
  return s200({ data: user, headers: req.search.verbose && id ? { 'X-Request-Id': id } : undefined })
})

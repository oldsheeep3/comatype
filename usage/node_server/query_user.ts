import { s } from '@comatype/typescript'
import { path, s200 } from '@/comatype/query_user'
import { db } from './db'

// QUERY is safe like GET, but sends the search criteria in the body
s.query(path, (req) => {
  // req.body: { name?: string, email?: string, limit?: number }
  return s200({ data: db.search(req.body) })
})

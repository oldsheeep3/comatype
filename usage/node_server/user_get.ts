// user/get.comat -> GET /user (a file named only after the method is the path of the directory itself)
import { s } from '@comatype/typescript'
import { path, s200 } from '@/comatype/user/get'
import { db } from './db'

s.get(path, (req) => {
  // req.search.limit: number | undefined
  return s200({ data: db.list(req.search.limit) })
})

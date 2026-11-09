// user/profile/get.comat → GET /user/profile
import { s } from '@comatype/typescript'
import { path, s200 } from '@/comatype/user/profile/get'

s.get(path, (req) => {
  // wrap auth is on, so req.ctx.user is readable through the ctx type of init.comat
  return s200({ data: req.ctx.user })
})

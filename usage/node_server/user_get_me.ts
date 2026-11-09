// `path ./me` of user/get_me.comat -> GET /user/me
import { s } from '@comatype/typescript'
import { path, s200 } from '@/comatype/user/get_me'

s.get(path, (req) => s200({ data: req.ctx.user }))

// `path /ping` of user/(noauth)/get_ping.comat -> GET /ping (a fixed path)
import { s } from '@comatype/typescript'
import { path, s200 } from '@/comatype/user/get_ping'

// wrap auth is off, so there is no ctx.user
s.get(path, () => s200({ data: { ok: true }, headers: { 'X-Server-Time': new Date().toISOString() } }))

// Functions that call each endpoint. Pass the generated path and statuses (s200 etc.) to c.xxx
//   c.put(path, request, success status, ...error statuses)
//   The result is the statuses passed (check `status`). 2xx is data, everything else is error
import { c } from '@comatype/javascript'
import { path, s200, s404 } from './comatype/user/put__id.js'

/** PUT /user/:id. The request has params and body, typed from put__id.comat (see put__id.d.ts) */
export async function putUser(id, user) {
  const res = await c.put(path, { params: { id }, body: user }, s200, s404)
  if (res.status === 200) return res.data // UserData (res.headers has X-Resource-Version)
  return res.error // ApiError
}

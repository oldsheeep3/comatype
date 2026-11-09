import { s } from '@comatype/typescript'
import { path, s200 } from '@/comatype/options_user'

// There are no params / search / body, so the handler has no request to read
s.options(path, () => {
  // The body is none, so there is no data; only the response headers are returned (Allow is required)
  return s200({ headers: { Allow: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'QUERY'] } })
})

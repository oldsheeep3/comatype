// user/(noauth)/post_login.comat -> POST /user/login. The group (noauth) is not part of the path
import { s } from '@comatype/typescript'
import { path, s200, s401 } from '@/comatype/user/post_login'
import { db } from './db'

// wrap auth is off, so it is called even when not logged in
s.post(path, (req) => {
  const token = db.login(req.body.email, req.body.password)
  if (!token) {
    return s401({ error: { code: 'invalid_credentials', message: 'email or password is wrong' } })
  }
  const user = db.bySession(token)!
  // cookie: the key is the name of `cookie session { ... }` in init.comat. httpOnly / secure / sameSite follow the settings in init.comat
  //   string -> Set-Cookie with that value / { value, maxAge, expires, path, domain } -> changes only this issue / null -> delete
  return s200({ data: { uid: user.uid }, cookie: { session: { value: token, maxAge: 3600 } } })
})

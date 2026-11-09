// Server init file: import and pass the implemented wrapper
// The cookie settings (name, httpOnly, etc.) are in init.comat
import { s } from '@comatype/javascript'
import { auth } from './wrappers/auth.js'

s.init({ wrappers: { auth } })

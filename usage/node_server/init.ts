// Server init file: import and pass the implemented ComatypeWrap
// The cookie settings (name, httpOnly, etc.) are in init.comat
import { s } from '@comatype/typescript'
import { auth } from './wrappers/auth'

s.init({
  // With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a compile error
  wrappers: { auth },
})

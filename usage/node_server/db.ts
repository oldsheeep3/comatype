// In-memory data in place of the app's own storage. Tests reset it to the initial state with reset()
import { randomUUID } from 'node:crypto'
import type { UserData } from '@/comatype/types'

type NewUser = Omit<UserData, 'uid'>

interface Account {
  user: UserData
  password: string
  /** Increments on every PUT. Shown in the response header X-Resource-Version */
  version: number
}

const accounts = new Map<string, Account>()
const sessions = new Map<string, string>() // session token -> uid

export const DEMO = { email: 'taro@example.com', password: 'password' }

export const db = {
  reset(): UserData {
    accounts.clear()
    sessions.clear()
    return db.create({ name: 'taro', email: DEMO.email, phone: '+819012345678' }, DEMO.password)
  },

  create(input: NewUser, password = ''): UserData {
    const user: UserData = { ...input, uid: randomUUID() }
    accounts.set(user.uid, { user, password, version: 1 })
    return user
  },

  find: (uid: string): UserData | undefined => accounts.get(uid)?.user,
  version: (uid: string): number => accounts.get(uid)?.version ?? 0,

  update(uid: string, user: UserData): number | undefined {
    const a = accounts.get(uid)
    if (!a) return undefined
    a.user = { ...user, uid } // uid cannot be changed
    return ++a.version
  },

  remove(uid: string): boolean {
    for (const [token, id] of sessions) if (id === uid) sessions.delete(token)
    return accounts.delete(uid)
  },

  list: (limit?: number): UserData[] => [...accounts.values()].map((a) => a.user).slice(0, limit),

  search(cond: { name?: string; email?: string; limit?: number }): UserData[] {
    return db
      .list()
      .filter((u) => (cond.name === undefined || u.name.includes(cond.name)) && (cond.email === undefined || u.email === cond.email))
      .slice(0, cond.limit)
  },

  login(email: string, password: string): string | undefined {
    const a = [...accounts.values()].find((x) => x.user.email === email && x.password === password && password !== '')
    if (!a) return undefined
    const token = randomUUID()
    sessions.set(token, a.user.uid)
    return token
  },

  bySession(token: string | undefined): UserData | undefined {
    const uid = token === undefined ? undefined : sessions.get(token)
    return uid === undefined ? undefined : accounts.get(uid)?.user
  },
}

db.reset()

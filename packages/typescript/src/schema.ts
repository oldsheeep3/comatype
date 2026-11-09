// Schema: does both type validation (parse: wire value -> TS value) and conversion (encode: TS value -> wire value)

export class ValidationError extends Error {
  path: string
  reason: string
  constructor(path: string, reason: string) {
    super(`${path || '(root)'}: ${reason}`)
    this.name = 'ValidationError'
    this.path = path
    this.reason = reason
  }
}

export interface Schema<T> {
  parse(value: unknown, path?: string): T
  encode(value: T): unknown
  /** Can be omitted as an object field */
  readonly optional?: boolean
  /** Information for converting headers / query strings (values that arrive as strings) to the type */
  readonly kind?: 'int' | 'bool' | 'array' | 'object' | 'other'
  readonly item?: Schema<any>
  readonly shape?: Record<string, Schema<any>>
}

// Types wrapping a string. Just an alias in TS (no brand). parse does the validation
export type Email = string
export type Phone = string
export type Uuid = string
export type Uuidv4 = string
export type Uuidv7 = string
export type DateStr = string
export type DateTimeStr = string
export type TimeStr = string
export type Decimal = string

const fail = (path: string, reason: string): never => {
  throw new ValidationError(path, reason)
}

const make = <T>(
  parse: (v: unknown, path: string) => T,
  encode: (v: T) => unknown = (v) => v,
  meta: Pick<Schema<T>, 'kind' | 'item' | 'shape'> = {},
): Schema<T> => ({
  parse: (v, path = '') => parse(v, path),
  encode,
  ...meta,
})

export interface Range {
  min?: number
  max?: number
}

const str = (name: string, test: (s: string) => boolean): Schema<string> =>
  make((v, path) => {
    if (typeof v !== 'string') return fail(path, `${name} は文字列で送ってください`)
    if (!test(v)) return fail(path, `${name} の形式が不正です`)
    return v
  })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/
const DATETIME = /^\d{4}-\d{2}-\d{2}[Tt]([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?([Zz]|[+-]([01]\d|2[0-3]):[0-5]\d)$/

const validDate = (s: string): boolean => {
  if (!DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s)
}

const toBase64 = (b: Uint8Array): string => {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}

const fromBase64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

const checkRange = (path: string, what: string, n: number, r?: Range) => {
  if (r?.min !== undefined && n < r.min) fail(path, `${what} は ${r.min} 以上にしてください`)
  if (r?.max !== undefined && n > r.max) fail(path, `${what} は ${r.max} 以下にしてください`)
}

export const t = {
  string(c?: Range & { pattern?: string }): Schema<string> {
    const re = c?.pattern === undefined ? undefined : new RegExp(c.pattern)
    return make((v, path) => {
      if (typeof v !== 'string') return fail(path, '文字列ではありません')
      checkRange(path, '文字数', [...v].length, c)
      if (re && !re.test(v)) return fail(path, `パターン ${c!.pattern} に一致しません`)
      return v
    })
  },
  bool: (): Schema<boolean> =>
    make((v, path) => (typeof v === 'boolean' ? v : fail(path, '真偽値ではありません')), undefined, { kind: 'bool' }),
  int(c?: Range): Schema<number> {
    return make((v, path) => {
      if (typeof v !== 'number' || !Number.isInteger(v)) return fail(path, '整数ではありません')
      checkRange(path, '値', v, c)
      return v
    }, undefined, { kind: 'int' })
  },
  email: (): Schema<Email> => str('email', (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)),
  phone: (): Schema<Phone> => str('phone', (s) => /^\+[1-9]\d{1,14}$/.test(s)),
  uuid: (): Schema<Uuid> => str('uuid', (s) => UUID_ANY.test(s)),
  uuidv4: (): Schema<Uuidv4> => str('uuidv4', (s) => UUID.test(s) && s[14] === '4'),
  uuidv7: (): Schema<Uuidv7> => str('uuidv7', (s) => UUID.test(s) && s[14] === '7'),
  date: (): Schema<DateStr> => str('date', validDate),
  datetime: (): Schema<DateTimeStr> =>
    str('datetime', (s) => DATETIME.test(s) && !Number.isNaN(Date.parse(s)) && validDate(s.slice(0, 10))),
  time: (): Schema<TimeStr> => str('time', (s) => TIME.test(s)),
  /** A string on the wire, bigint in TS */
  int64(c?: Range): Schema<bigint> {
    return make(
      (v, path) => {
        if (typeof v !== 'string' || !/^-?\d+$/.test(v)) return fail(path, 'int64 は整数の文字列で送ってください')
        const n = BigInt(v)
        if (n < -(2n ** 63n) || n >= 2n ** 63n) return fail(path, 'int64 の範囲外です')
        if (c?.min !== undefined && n < BigInt(c.min)) return fail(path, `値は ${c.min} 以上にしてください`)
        if (c?.max !== undefined && n > BigInt(c.max)) return fail(path, `値は ${c.max} 以下にしてください`)
        return n
      },
      (n) => n.toString(),
    )
  },
  /** A string both on the wire and in TS (not number, to avoid precision errors) */
  decimal(c?: Range): Schema<Decimal> {
    return make((v, path) => {
      if (typeof v !== 'string' || !/^-?\d+(\.\d+)?$/.test(v)) return fail(path, 'decimal は数値の文字列で送ってください')
      checkRange(path, '値', Number(v), c)
      return v
    })
  },
  url: (): Schema<URL> =>
    make(
      (v, path) => {
        if (typeof v !== 'string') return fail(path, 'url は文字列で送ってください')
        try {
          return new URL(v)
        } catch {
          return fail(path, 'url の形式が不正です')
        }
      },
      (u) => u.toString(),
    ),
  bytes: (): Schema<Uint8Array> =>
    make(
      (v, path) => {
        if (typeof v !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(v) || v.length % 4 !== 0) {
          return fail(path, 'bytes は base64 の文字列で送ってください')
        }
        return fromBase64(v)
      },
      toBase64,
    ),
  json: (): Schema<unknown> => make((v) => v),
  null: (): Schema<null> => make((v, path) => (v === null ? null : fail(path, 'null ではありません'))),

  literal<T extends string>(value: T): Schema<T> {
    return make((v, path) => (v === value ? value : fail(path, `${JSON.stringify(value)} ではありません`)))
  },
  enum<T extends string>(values: readonly T[]): Schema<T> {
    return make((v, path) =>
      typeof v === 'string' && (values as readonly string[]).includes(v)
        ? (v as T)
        : fail(path, `${values.map((x) => JSON.stringify(x)).join(' | ')} のどれかにしてください`),
    )
  },
  array<T>(item: Schema<T>): Schema<T[]> {
    return make(
      (v, path) => {
        if (!Array.isArray(v)) return fail(path, '配列ではありません')
        return v.map((x, i) => item.parse(x, `${path}[${i}]`))
      },
      (a) => a.map((x) => item.encode(x)),
      { kind: 'array', item },
    )
  },
  union<T extends unknown[]>(...variants: { [K in keyof T]: Schema<T[K]> }): Schema<T[number]> {
    const vs = variants as Schema<unknown>[]
    return make(
      (v, path) => {
        const reasons: string[] = []
        for (const s of vs) {
          try {
            return s.parse(v, path) as T[number]
          } catch (e) {
            if (!(e instanceof ValidationError)) throw e
            reasons.push(e.reason)
          }
        }
        return fail(path, `どの型にも一致しません（${reasons.join(' / ')}）`)
      },
      (x) => {
        // encode uses the first type whose structure matches (pick one that can be parsed again)
        for (const s of vs) {
          try {
            const out = s.encode(x)
            s.parse(out)
            return out
          } catch {
            /* try the next type */
          }
        }
        return x
      },
    )
  },
  /** A field that can be omitted */
  opt<T>(s: Schema<T>): Schema<T | undefined> {
    return { ...s, optional: true } as Schema<T | undefined>
  },
  /** Lazy evaluation for self- and mutual references */
  lazy<T>(f: () => Schema<T>): Schema<T> {
    return { parse: (v, path) => f().parse(v, path), encode: (v) => f().encode(v) }
  },
  /** The type T is supplied by the caller (generated code) via annotation. Only runtime validation happens here */
  object<T>(shape: Record<string, Schema<any>>): Schema<T> {
    return make(
      (v, path) => {
        if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(path, 'オブジェクトではありません')
        const src = v as Record<string, unknown>
        const out: Record<string, unknown> = {}
        for (const [k, s] of Object.entries(shape)) {
          const p = path ? `${path}.${k}` : k
          if (src[k] === undefined) {
            if (!s.optional) fail(p, '必須です')
            continue
          }
          out[k] = s.parse(src[k], p)
        }
        return out as T
      },
      (v) => {
        const src = v as Record<string, unknown>
        const out: Record<string, unknown> = {}
        for (const [k, s] of Object.entries(shape)) {
          if (src[k] !== undefined) out[k] = s.encode(src[k])
        }
        return out
      },
      { kind: 'object', shape },
    )
  },
}

// Wire-form conversion: between values that arrive as strings (headers, query strings, path) and the schema

import type { Schema } from './schema.ts'

/** Turn into a string for headers / query strings. Arrays are joined with ", " (headers) or repeated by the caller (query) */
export function toWireString(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) return JSON.stringify(v)
  return String(v)
}

export function headerString(v: unknown): string {
  return Array.isArray(v) ? v.map(toWireString).join(', ') : toWireString(v)
}

/** Convert a value that arrived as a string to int / bool / array according to the schema kind (if it cannot be converted, return it as is and leave it to validation) */
export function coerce(schema: Schema<any> | undefined, v: string | string[] | undefined): unknown {
  if (v === undefined) return undefined
  switch (schema?.kind) {
    case 'int':
      return typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : v
    case 'bool':
      return v === 'true' ? true : v === 'false' ? false : v
    case 'array': {
      const parts = Array.isArray(v) ? v : v === '' ? [] : v.split(',').map((x) => x.trim())
      return parts.map((x) => coerce(schema.item, x))
    }
    default:
      return v
  }
}

/** Coerce per key of an object schema. With `ci`, keys are looked up case-insensitively (for headers) */
export function coerceObject(
  schema: Schema<any>,
  src: Record<string, string | string[] | undefined>,
  ci = false,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const lower: Record<string, string | string[] | undefined> = {}
  if (ci) for (const [k, v] of Object.entries(src)) lower[k.toLowerCase()] = v
  for (const [k, s] of Object.entries(schema.shape ?? {})) {
    const v = ci ? lower[k.toLowerCase()] : src[k]
    if (v !== undefined) out[k] = coerce(s, v)
  }
  return out
}

/** Validate a TS value before sending: encode it, then parse the wire form again */
export function validateOut<T>(schema: Schema<T>, value: T): unknown {
  const wire = schema.encode(value)
  schema.parse(wire)
  return wire
}

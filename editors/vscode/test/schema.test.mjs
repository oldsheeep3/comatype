// The JSON Schema bundled in the extension is the same as the repository's schema, and is registered for comatype.config.json

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

test('bundled schema matches schema/comatype.config.schema.json', () => {
  assert.equal(read('../schemas/comatype.config.schema.json'), read('../../../schema/comatype.config.schema.json'))
})

test('jsonValidation is registered for comatype.config.json', () => {
  const pkg = JSON.parse(read('../package.json'))
  const v = pkg.contributes.jsonValidation
  assert.deepEqual(v, [{ fileMatch: 'comatype.config.json', url: './schemas/comatype.config.schema.json' }])
})

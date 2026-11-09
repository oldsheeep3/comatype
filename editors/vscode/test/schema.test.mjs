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

test('the .comat file icon is registered and matches the logo assets', () => {
  const pkg = JSON.parse(read('../package.json'))
  const lang = pkg.contributes.languages.find((l) => l.id === 'comat')
  assert.deepEqual(lang.icon, { light: './images/comat-light.svg', dark: './images/comat-dark.svg' })
  assert.equal(read('../images/comat-light.svg'), read('../../../assets/logo/logo-mark.svg'))
  assert.equal(read('../images/comat-dark.svg'), read('../../../assets/logo/logo-mark-dark.svg'))
  const ignore = read('../.vscodeignore')
  assert.ok(ignore.includes('!images/comat-light.svg') && ignore.includes('!images/comat-dark.svg'))
})

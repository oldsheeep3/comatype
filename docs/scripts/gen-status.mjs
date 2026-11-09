// Rebuild the status code list (data/status-codes.json) from the registry (comatype statuses --json)
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const out = execFileSync(
  'cargo',
  ['run', '-q', '-p', 'comatype-cli', '--manifest-path', `${root}/Cargo.toml`, '--', 'statuses', '--json'],
  { encoding: 'utf8' },
)
const list = JSON.parse(out).map(({ status, message, body }) => ({ status, message, body }))
writeFileSync(new URL('../data/status-codes.json', import.meta.url), JSON.stringify(list, null, 2) + '\n')
console.log(`data/status-codes.json: ${list.length} 件`)

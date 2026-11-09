// The code shown in "Generated examples per language" (examples/generated) matches the current generator output

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const bin = join(root, 'target/debug/comatype')
const examples = fileURLToPath(new URL('../examples', import.meta.url))

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? files(p) : [p]
  })
}

test('examples/generated は comatype generate の出力と同じ', (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype がありません（cargo build）')
  const tmp = mkdtempSync(join(tmpdir(), 'comat-generated-'))
  cpSync(join(examples, 'quickstart'), join(tmp, 'quickstart'), { recursive: true })
  cpSync(join(examples, 'generated'), join(tmp, 'generated'), { recursive: true })
  const gen = spawnSync(bin, ['generate', '--config', join(tmp, 'generated')], { encoding: 'utf8' })
  assert.equal(gen.status, 0, gen.stderr)
  const base = join(examples, 'generated')
  for (const f of files(base)) {
    const rel = relative(base, f)
    if (rel === 'comatype.config.json') continue
    const fresh = join(tmp, 'generated', rel)
    assert.ok(existsSync(fresh), `${rel} が生成されません`)
    assert.equal(
      readFileSync(f, 'utf8'),
      readFileSync(fresh, 'utf8'),
      `${rel} が古いです（cd docs/examples/generated && ../../../target/debug/comatype generate --config .）`,
    )
  }
  assert.ok(statSync(join(base, 'swift')).isDirectory())
  assert.ok(statSync(join(base, 'js')).isDirectory())
  assert.ok(statSync(join(base, 'csharp')).isDirectory())
})

test('code-group のタブが、ビルドした HTML に出る', (t) => {
  const html = join(fileURLToPath(new URL('..', import.meta.url)), 'out/guide/generated-code/index.html')
  if (!existsSync(html)) return t.skip('docs/out がありません（pnpm build）')
  const text = readFileSync(html, 'utf8')
  for (const lang of ['TypeScript', 'JavaScript', 'Go', 'Python', 'Rust', 'Java', 'Kotlin', 'Swift', 'Ruby', 'C#']) {
    assert.match(text, new RegExp(`role="tab"[^>]*>${lang}<`), `${lang} のタブがありません`)
  }
})

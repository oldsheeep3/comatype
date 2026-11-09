// The quickstart example (examples/quickstart) really works: check -> generate -> type check
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const bin = join(root, 'target/debug/comatype')
const tsc = join(root, 'node_modules/.bin/tsc')
const example = fileURLToPath(new URL('../examples/quickstart', import.meta.url))

test('quickstart: comatype check と generate が通り、生成物と一緒に型検査が通る', (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype がありません（cargo build）')
  const dir = mkdtempSync(join(tmpdir(), 'comat-quickstart-'))
  cpSync(example, dir, { recursive: true })

  const check = spawnSync(bin, ['check', '--config', dir], { encoding: 'utf8' })
  assert.equal(check.status, 0, check.stderr)
  assert.match(check.stderr, /エンドポイント 2 件/)
  const gen = spawnSync(bin, ['generate', '--config', dir], { encoding: 'utf8' })
  assert.equal(gen.status, 0, gen.stderr)
  assert.ok(existsSync(join(dir, 'server/comatype/post_todo.ts')))
  assert.ok(existsSync(join(dir, 'client/comatype/todo/__id/get.ts')))

  for (const side of ['server', 'client']) {
    writeFileSync(
      join(dir, side, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, skipLibCheck: true,
          allowImportingTsExtensions: true, lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: ['node'],
          typeRoots: [join(root, 'node_modules/@types')],
          baseUrl: '.',
          paths: { '@/*': ['./*'], '@comatype/typescript': [join(root, 'packages/typescript/src/index.ts')], '@comatype/typescript/node': [join(root, 'packages/typescript/src/node.ts')] },
        },
        include: ['.'],
      }),
    )
    const r = spawnSync(tsc, ['-p', join(dir, side)], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${side}: ${r.stdout}${r.stderr}`)
  }
})

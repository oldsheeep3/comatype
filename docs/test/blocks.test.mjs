// The code in the specification is real:
//  - every ```comat code block passes comatype's parser (deliberately wrong ones are ```comat invalid)
//  - every file pulled in by <<< exists
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const docs = fileURLToPath(new URL('..', import.meta.url))
const bin = join(docs, '../target/debug/comatype')

function* markdown(dir) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.vitepress', 'examples', 'test', 'data'].includes(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* markdown(p)
    else if (name.endsWith('.md')) yield p
  }
}

const files = [...markdown(join(docs, 'content'))]

test('ページが揃っている（サイドバーのリンク先がすべてある）', () => {
  const site = readFileSync(join(docs, 'lib/site.ts'), 'utf8')
  const links = [...new Set([...site.matchAll(/href: '(\/(?:guide|language|runtime|reference)\/[^']*)'/g)].map((m) => m[1]))]
  assert.ok(links.length >= 20, `リンクが少なすぎます: ${links.length}`)
  for (const locale of ['en', 'ja-jp']) {
    for (const l of links) {
      const f = join(docs, 'content', locale, `${l.replace(/\/$/, '')}.md`)
      assert.ok(existsSync(f), `${locale}: ${l} のページがありません`)
    }
  }
})

test('<<< で引いているファイルが存在する', () => {
  let count = 0
  for (const f of files) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = /^<<<\s+(\S+)/.exec(line)
      if (!m) continue
      count++
      const target = m[1].replace(/^@\//, '').replace(/[#{].*$/, '')
      assert.ok(existsSync(join(docs, target)), `${relative(docs, f)}: ${target} がありません`)
    }
  }
  assert.ok(count >= 30, `引いているファイルが少なすぎます: ${count}`)
})

test('```comat のコードブロックは、すべて構文解析を通る', (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype がありません（cargo build）')
  const dir = mkdtempSync(join(tmpdir(), 'comat-docs-'))
  let count = 0
  const failures = []
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const open = /^```comat(\s.*)?$/.exec(lines[i])
      if (!open) continue
      const body = []
      let j = i + 1
      while (j < lines.length && !lines[j].startsWith('```')) body.push(lines[j++])
      i = j
      if (/\binvalid\b/.test(open[1] ?? '')) continue
      count++
      const file = join(dir, `${count}.comat`)
      writeFileSync(file, body.join('\n') + '\n')
      const r = spawnSync(bin, ['parse', file], { encoding: 'utf8' })
      if (r.status !== 0) failures.push(`${relative(docs, f)}:${i - body.length + 1}\n${body.join('\n')}\n→ ${r.stderr.trim()}`)
    }
  }
  assert.ok(count >= 10, `コードブロックが少なすぎます: ${count}`)
  assert.deepEqual(failures, [])
})

test('Playground の見本は、構文解析を通る（わざと間違えた行も、構文は正しい）', (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype がありません')
  const src = readFileSync(join(docs, 'components/Playground.tsx'), 'utf8')
  const texts = [...src.matchAll(/text: `([\s\S]*?)`,\n  \}/g)].map((m) => m[1])
  assert.ok(texts.length >= 4, `見本が少なすぎます: ${texts.length}`)
  const dir = mkdtempSync(join(tmpdir(), 'comat-play-'))
  texts.forEach((text, i) => {
    const file = join(dir, `${i}.comat`)
    writeFileSync(file, text)
    const r = spawnSync(bin, ['parse', file], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${i}: ${r.stderr}`)
  })
})

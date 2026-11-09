// Check the result of the static export (out/). Run `pnpm build` first

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const docs = fileURLToPath(new URL('..', import.meta.url))
const out = join(docs, 'out')
const built = existsSync(join(out, 'index.html'))
// TODO: remove once the guide pages (content/*/guide) are published. Until then, links to them are allowed to dangle.
const guidePublished = existsSync(join(docs, 'content/en/guide'))

function* pages(dir) {
  for (const name of readdirSync(dir)) {
    if (name === '_next') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* pages(p)
    else if (name === 'index.html') yield p
  }
}

test('全ページが出力され、<<< や ::: が残っていない', (t) => {
  if (!built) return t.skip('out/ がありません（pnpm build）')
  const files = [...pages(out)]
  assert.ok(files.length >= 24, `ページが少なすぎます: ${files.length}`)
  for (const f of files) {
    const html = readFileSync(f, 'utf8')
    assert.ok(!/&lt;&lt;&lt; @\//.test(html) && !/<p>:::/.test(html), `${f}: 未処理の記法が残っています`)
  }
})

test('内部リンクがすべて出力先に存在する', (t) => {
  if (!built) return t.skip('out/ がありません')
  const bad = []
  for (const f of pages(out)) {
    const html = readFileSync(f, 'utf8')
    for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
      const h = m[1]
      if (h.startsWith('/_next')) continue
      if (!guidePublished && /^(\/ja-jp)?\/guide\//.test(h)) continue
      const target = join(out, h)
      if (!existsSync(target) && !existsSync(join(target, 'index.html'))) bad.push(`${f.replace(out, '')} → ${h}`)
    }
  }
  assert.deepEqual([...new Set(bad)], [])
})

test('コードは shiki で色分けされ、.comat も対象になる', (t) => {
  if (!built) return t.skip('out/ がありません')
  const html = readFileSync(join(out, 'language/types/index.html'), 'utf8')
  assert.match(html, /class="shiki/)
  assert.match(html, /--shiki-dark:/)
  assert.match(html, /data-lang="comat"/)
})

test('search.json が出力される', (t) => {
  if (!built) return t.skip('out/ がありません')
  const idx = JSON.parse(readFileSync(join(out, 'search.json'), 'utf8'))
  assert.ok(Array.isArray(idx) && idx.length >= 20)
})

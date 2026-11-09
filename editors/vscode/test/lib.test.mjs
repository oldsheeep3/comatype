import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { findConfig, parseDiagnostics, importLinks, exportOpenApiArgs, importOpenApiArgs, TARGET_PRESETS } = require('../lib.js')
const root = fileURLToPath(new URL('../../..', import.meta.url))

test('parseDiagnostics: with a position, without a position, summary lines', () => {
  const out = [
    'comatfiles/get_user.comat:5:1: warning: an explicit path is deprecated',
    'comatfiles/user/put_[id].comat:12:8: error: type `X` not found',
    'comatype.config.json: error: coatDir not found',
    '1 error(s), 1 warning(s)',
    'OK: 11 endpoint(s), 3 warning(s)',
  ].join('\n')
  const d = parseDiagnostics(out, '/proj')
  assert.deepEqual(d, [
    { file: '/proj/comatfiles/get_user.comat', line: 4, col: 0, severity: 'warning', message: 'an explicit path is deprecated' },
    { file: '/proj/comatfiles/user/put_[id].comat', line: 11, col: 7, severity: 'error', message: 'type `X` not found' },
    { file: '/proj/comatype.config.json', line: 0, col: 0, severity: 'error', message: 'coatDir not found' },
  ])
})

test('parseDiagnostics: the new format ([error] / [warn] / [info])', () => {
  const out = [
    '[warn]  comatfiles/get_user.comat:5:1  an explicit path is deprecated',
    '[error] comatfiles/user/put_[id].comat:12:8  type `X` not found',
    '[error] comatfiles/post_a.comat  cache can only be written in get / query endpoints (post)',
    '[error] 1 error(s), 1 warning(s)',
    '[info]  OK: 11 endpoint(s), 3 warning(s)',
  ].join('\n')
  const d = parseDiagnostics(out, '/proj')
  assert.deepEqual(
    d.map((x) => [x.file, x.line, x.col, x.severity, x.message]),
    [
      ['/proj/comatfiles/get_user.comat', 4, 0, 'warning', 'an explicit path is deprecated'],
      ['/proj/comatfiles/user/put_[id].comat', 11, 7, 'error', 'type `X` not found'],
      ['/proj/comatfiles/post_a.comat', 0, 0, 'error', 'cache can only be written in get / query endpoints (post)'],
    ],
  )
})

test('importLinks: the range of the path', () => {
  const text = '// c\nimport A, B from ../types/x.comat\n  import C from ./c.comat // trailing\nbody A'
  const links = importLinks(text)
  assert.equal(links.length, 2)
  assert.deepEqual(links[0], { line: 1, start: 17, end: 33, target: '../types/x.comat' })
  const line2 = text.split('\n')[2]
  assert.equal(line2.slice(links[1].start, links[1].end), './c.comat')
})

test('findConfig: searches upwards', () => {
  const exists = (p) => p === '/a/comatype.config.json'
  assert.equal(findConfig('/a/b/c', exists), '/a/comatype.config.json')
  assert.equal(findConfig('/x/y', exists), undefined)
})

// Runs the real CLI output through the extension's parser (needs the comatype binary; run cargo build first)
const bin = join(root, 'target/debug/comatype')

test('the real output of comatype check can be turned into diagnostics (errors and warnings)', (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype is missing (cargo build)')
  const dir = mkdtempSync(join(tmpdir(), 'comat-vscode-'))
  mkdirSync(join(dir, 'comatfiles'))
  writeFileSync(join(dir, 'comatype.config.json'), '{"services":{"api":{"comatDir":"./comatfiles"}}}')
  writeFileSync(join(dir, 'comatfiles/init.comat'), '')
  writeFileSync(join(dir, 'comatfiles/get_a.comat'), 'path /a\ns200 Missing\n')
  const res = spawnSync(bin, ['check', '--config', dir], { encoding: 'utf8' })
  assert.equal(res.status, 1)
  const d = parseDiagnostics(res.stderr, dir)
  const err = d.find((x) => x.severity === 'error')
  assert.equal(err.file, resolve(dir, 'comatfiles/get_a.comat'))
  assert.equal(err.line, 1)
  assert.match(err.message, /Missing/)
  assert.ok(d.some((x) => x.severity === 'warning' && x.line === 0))
})

test('check on usage gives warnings only (0 errors) and can be converted to diagnostics', (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype is missing')
  const usage = join(root, 'usage')
  const res = spawnSync(bin, ['check', '--config', usage], { encoding: 'utf8' })
  assert.equal(res.status, 0)
  const d = parseDiagnostics(res.stderr, usage)
  assert.equal(d.filter((x) => x.severity === 'error').length, 0)
  // Warnings: explicit path (3) and cache + wrap (2: get_me, and get_news in the wraps service)
  const warnings = d.filter((x) => x.severity === 'warning')
  assert.equal(warnings.filter((x) => x.message.includes('an explicit path')).length, 3)
  assert.equal(warnings.filter((x) => x.message.includes('cache')).length, 2)
  assert.equal(warnings.length, 5)
})

test('package.json: the grammar, snippets and commands it refers to exist', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const c = pkg.contributes
  for (const rel of [c.grammars[0].path, c.snippets[0].path, c.languages[0].configuration, pkg.main]) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${rel}`, import.meta.url)), rel)
  }
  const snippets = JSON.parse(readFileSync(new URL('../snippets/comat.json', import.meta.url), 'utf8'))
  assert.ok(Object.keys(snippets).length >= 10)
  assert.deepEqual(c.commands.map((x) => x.command).sort(), [
    'comatype.check',
    'comatype.exportOpenApi',
    'comatype.generate',
    'comatype.importOpenApi',
    'comatype.restartServer',
    'comatype.showStatusCodes',
  ])
})

test('the status code snippets match the registry (comatype statuses)', (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype is missing (cargo build)')
  const expected = JSON.parse(execFileSync(bin, ['statuses', '--snippets'], { encoding: 'utf8' }))
  const actual = JSON.parse(readFileSync(new URL('../snippets/status.json', import.meta.url), 'utf8'))
  assert.deepEqual(actual, expected, 'regenerate with scripts/gen-status-snippets.sh')
  assert.equal(Object.keys(actual).length, 62)
  // Codes that cannot have a body are none; the others are { message: string }
  assert.deepEqual(actual.s204.body, ['s204 none'])
  assert.deepEqual(actual.s404.body, ['s404 {', '\tmessage: string,', '}'])
  assert.equal(actual.s404.description, '404 Not Found')
  assert.equal(actual.s306, undefined, 'unused codes are not included')
  // The snippet prefixes match the codes in the list
  const list = JSON.parse(execFileSync(bin, ['statuses', '--json'], { encoding: 'utf8' }))
  assert.deepEqual(
    Object.values(actual).map((x) => x.prefix),
    list.map((x) => `s${x.status}`),
  )
})

test('arguments of the OpenAPI commands', () => {
  assert.deepEqual(exportOpenApiArgs('/p/comatype.config.json', '/p/openapi.yml'), [
    'to-openapi',
    '--config',
    '/p/comatype.config.json',
    '-o',
    '/p/openapi.yml',
  ])
  assert.deepEqual(exportOpenApiArgs('/c', '/o.yml', 'api').slice(-2), ['--service', 'api'])
  const targets = [
    { lang: 'ts', role: 'client', root: './client' },
    { lang: 'go', role: 'server', root: './s' },
  ]
  assert.deepEqual(importOpenApiArgs('/spec.yml', '/dest', targets, true, false), [
    'from-openapi',
    '/spec.yml',
    '--out',
    '/dest',
    '--target',
    'ts:client:./client',
    '--target',
    'go:server:./s',
    '--generate',
  ])
  // Without an output location, --generate is not added (nothing can be generated). Overwrite with --force
  assert.deepEqual(importOpenApiArgs('/spec.yml', '/dest', [], true, true), ['from-openapi', '/spec.yml', '--out', '/dest', '--force'])
  assert.ok(TARGET_PRESETS.every((t) => ['ts', 'go', 'python'].includes(t.lang) && ['client', 'server'].includes(t.role)))
})

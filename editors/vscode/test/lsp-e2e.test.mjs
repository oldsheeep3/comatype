// Starts the real `comatype lsp` as a child process and speaks LSP over stdin / stdout (checks the contract between the extension and the server)

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const bin = join(root, 'target/debug/comatype')

class Client {
  constructor() {
    this.child = spawn(bin, ['lsp'])
    this.buf = Buffer.alloc(0)
    this.waiters = []
    this.messages = []
    this.nextId = 1
    this.child.stdout.on('data', (d) => {
      this.buf = Buffer.concat([this.buf, d])
      for (;;) {
        const end = this.buf.indexOf('\r\n\r\n')
        if (end < 0) return
        const len = Number(/Content-Length: (\d+)/.exec(this.buf.slice(0, end).toString())[1])
        if (this.buf.length < end + 4 + len) return
        const msg = JSON.parse(this.buf.slice(end + 4, end + 4 + len).toString())
        this.buf = this.buf.slice(end + 4 + len)
        this.messages.push(msg)
        this.waiters = this.waiters.filter((w) => !w(msg))
      }
    })
  }
  send(msg) {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }))
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.child.stdin.write(body)
  }
  request(method, params) {
    const id = this.nextId++
    this.send({ id, method, params })
    return this.until((m) => m.id === id)
  }
  until(pred, ms = 5000) {
    const hit = this.messages.find(pred)
    if (hit) return Promise.resolve(hit)
    return new Promise((ok, ng) => {
      const t = setTimeout(() => ng(new Error('timed out')), ms)
      this.waiters.push((m) => (pred(m) ? (clearTimeout(t), ok(m), true) : false))
    })
  }
  async close() {
    await this.request('shutdown', null)
    this.send({ method: 'exit' })
    return new Promise((ok) => this.child.on('close', ok))
  }
}

test('the real comatype lsp: diagnostics (syntax error -> fix), go to definition, exit code', async (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype is missing (cargo build)')
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'comat-lsp-')))
  mkdirSync(join(dir, 'comatfiles'))
  mkdirSync(join(dir, 'types'))
  writeFileSync(join(dir, 'comatype.config.json'), '{"services":{"api":{"comatDir":"./comatfiles"}}}')
  writeFileSync(join(dir, 'comatfiles/init.comat'), '')
  writeFileSync(join(dir, 'types/User.comat'), 'User {\n  name: string,\n}\n')
  const file = join(dir, 'comatfiles/get_a.comat')
  writeFileSync(file, 'import User from ../types/User.comat\ns200 User\n')
  const uri = pathToFileURL(file).href

  const c = new Client()
  const init = await c.request('initialize', { processId: null, rootUri: pathToFileURL(dir).href, capabilities: {} })
  assert.equal(init.result.capabilities.definitionProvider, true)
  c.send({ method: 'initialized', params: {} })

  const diagsFor = (pred) =>
    c.until((m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri && pred(m.params.diagnostics))
  c.send({
    method: 'textDocument/didOpen',
    params: { textDocument: { uri, languageId: 'comat', version: 1, text: 'import User from ../types/User.comat\ns200 {\n' } },
  })
  const broken = await diagsFor((d) => d.length > 0)
  assert.equal(broken.params.diagnostics[0].severity, 1)
  assert.equal(broken.params.diagnostics[0].source, 'comatype')

  c.messages.length = 0
  c.send({
    method: 'textDocument/didChange',
    params: { textDocument: { uri, version: 2 }, contentChanges: [{ text: 'import User from ../types/User.comat\ns200 User\n' }] },
  })
  await diagsFor((d) => d.every((x) => x.severity !== 1))

  const def = await c.request('textDocument/definition', { textDocument: { uri }, position: { line: 1, character: 6 } })
  assert.equal(def.result.uri, pathToFileURL(join(dir, 'types/User.comat')).href)
  assert.deepEqual(def.result.range.start, { line: 0, character: 0 })

  assert.equal(await c.close(), 0)
})

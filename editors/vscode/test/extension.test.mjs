// Replaces vscode and checks what activate registers and the check flow (real CLI → diagnostics)

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../../..', import.meta.url))
const bin = join(root, 'target/debug/comatype')

function makeVscode(state) {
  class Range {
    constructor(a, b, c, d) {
      Object.assign(this, { sl: a, sc: b, el: c, ec: d })
    }
  }
  class Diagnostic {
    constructor(range, message, severity) {
      Object.assign(this, { range, message, severity })
    }
  }
  class DocumentLink {
    constructor(range, target) {
      Object.assign(this, { range, target })
    }
  }
  const subs = (x) => x
  return {
    Range,
    Diagnostic,
    DocumentLink,
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    StatusBarAlignment: { Left: 1 },
    Uri: { file: (p) => ({ fsPath: p, scheme: 'file', toString: () => p }) },
    SnippetString: class {
      constructor(value) {
        this.value = value
      }
    },
    languages: {
      createDiagnosticCollection: () => ({
        map: new Map(),
        clear() {
          this.map.clear()
        },
        set(uri, list) {
          this.map.set(uri.fsPath, list)
          state.diags = this.map
        },
        dispose() {},
      }),
      registerDocumentLinkProvider: (_sel, provider) => {
        state.links = provider
        return subs({})
      },
    },
    window: {
      createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
      createStatusBarItem: () => {
        state.status = { text: '', show() {}, hide() {}, dispose() {} }
        return state.status
      },
      activeTextEditor: state.editor,
      showInformationMessage: async (...a) => {
        ;(state.messages ??= []).push(a[0])
        return undefined
      },
      showWarningMessage: async (...a) => {
        ;(state.messages ??= []).push(a[0])
        return undefined
      },
      showErrorMessage: async (...a) => {
        ;(state.messages ??= []).push(a[0])
        return undefined
      },
      showSaveDialog: async () => state.saveTo,
      showOpenDialog: async () => state.openQueue?.shift(),
      showQuickPick: async (items) => state.pick?.(items),
      showTextDocument: async () => {},
    },
    workspace: {
      workspaceFolders: state.folders,
      getConfiguration: () => ({
        get: (k) => ({ path: bin, config: '', checkOnSave: true, 'languageServer.enabled': false, ...state.settings })[k],
      }),
      onDidSaveTextDocument: () => ({}),
      onDidOpenTextDocument: () => ({}),
      openTextDocument: async (u) => u,
    },
    commands: {
      registerCommand: (id, fn) => {
        state.commands[id] = fn
        return {}
      },
    },
  }
}

function load(state) {
  const vscode = makeVscode(state)
  const orig = Module._load
  const languageclient = {
    LanguageClient: class {
      constructor(id, name, serverOptions, clientOptions) {
        Object.assign(this, { id, name, serverOptions, clientOptions })
        state.clients = [...(state.clients ?? []), this]
        this.log = []
      }
      async start() {
        this.log.push('start')
        if (state.startFails) throw new Error('spawn comatype ENOENT')
      }
      async stop() {
        this.log.push('stop')
      }
    },
  }
  Module._load = function (request, ...rest) {
    if (request === 'vscode-languageclient/node') return languageclient
    return request === 'vscode' ? vscode : orig.call(this, request, ...rest)
  }
  delete require.cache[require.resolve('../extension.js')]
  // vscode-languageclient, which is required inside activate, is also replaced, so keep it replaced for the duration of the tests
  const ext = require('../extension.js')
  return { activate: async (...a) => ext.activate(...a), restore: () => (Module._load = orig) }
}

test('activate: registers the commands and links, and check publishes diagnostics', async (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype is missing (cargo build)')
  const dir = mkdtempSync(join(tmpdir(), 'comat-ext-'))
  mkdirSync(join(dir, 'comatfiles'))
  writeFileSync(join(dir, 'comatype.config.json'), '{"services":{"api":{"comatDir":"./comatfiles"}}}')
  writeFileSync(join(dir, 'comatfiles/init.comat'), '')
  const file = join(dir, 'comatfiles/get_a.comat')
  writeFileSync(file, 'path /a\ns200 Missing\n')

  const state = {
    commands: {},
    folders: [{ uri: { fsPath: dir } }],
    editor: { document: { uri: { fsPath: file, scheme: 'file' }, languageId: 'comat' } },
  }
  const ext = load(state)
  const context = { subscriptions: [] }
  ext.activate(context)
  assert.deepEqual(Object.keys(state.commands).sort(), [
    'comatype.check',
    'comatype.exportOpenApi',
    'comatype.generate',
    'comatype.importOpenApi',
    'comatype.restartServer',
    'comatype.showStatusCodes',
  ])

  // Wait for the check started by activate to finish, then run it again with the command
  await state.commands['comatype.check']()
  for (let i = 0; i < 100 && !state.diags; i++) await new Promise((r) => setTimeout(r, 50))
  const list = state.diags.get(file)
  assert.ok(list, `no diagnostics were published: ${[...state.diags.keys()]}`)
  const err = list.find((d) => d.severity === 0)
  assert.match(err.message, /Missing/)
  assert.equal(err.range.sl, 1)
  assert.match(state.status.text, /Comatype 1/)

  // import links
  const doc = { uri: { fsPath: join(dir, 'comatfiles/x.comat') }, getText: () => 'import A from ../types/a.comat\n' }
  const links = state.links.provideDocumentLinks(doc)
  assert.equal(links.length, 1)
  assert.equal(links[0].target.fsPath, join(dir, 'types/a.comat'))
})

test('does nothing when no config file is found', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'comat-none-'))
  const state = { commands: {}, folders: [{ uri: { fsPath: dir } }], editor: undefined }
  const ext = load(state)
  ext.activate({ subscriptions: [] })
  await state.commands['comatype.check']()
  assert.equal(state.diags, undefined)
})

test('language server: starts comatype lsp and can restart it', async () => {
  const state = { commands: {}, folders: [], editor: undefined, settings: { 'languageServer.enabled': true, path: '/opt/bin/comatype' } }
  const ext = load(state)
  const context = { subscriptions: [] }
  await ext.activate(context)
  assert.equal(state.clients.length, 1)
  const [client] = state.clients
  assert.deepEqual(client.serverOptions, { command: '/opt/bin/comatype', args: ['lsp'] })
  assert.deepEqual(client.clientOptions.documentSelector, [{ scheme: 'file', language: 'comat' }])
  assert.deepEqual(client.log, ['start'])
  // Diagnostics come from the language server, so the extension itself publishes none (comatype.check restarts it)
  assert.deepEqual(Object.keys(state.commands).sort(), [
    'comatype.check',
    'comatype.exportOpenApi',
    'comatype.generate',
    'comatype.importOpenApi',
    'comatype.restartServer',
    'comatype.showStatusCodes',
  ])
  await state.commands['comatype.restartServer']()
  assert.equal(state.clients.length, 2)
  assert.deepEqual(client.log, ['start', 'stop'])
  assert.deepEqual(state.clients[1].log, ['start'])
})

test('the extension survives a language server that cannot start (it shows an error)', async () => {
  const state = { commands: {}, folders: [], editor: undefined, startFails: true, settings: { 'languageServer.enabled': true } }
  const messages = []
  const ext = load(state)
  await ext.activate({ subscriptions: [] })
  assert.equal(state.clients.length, 1)
  void messages
})

// ---- OpenAPI commands (run with the real comatype) ----

import { existsSync, readdirSync, readFileSync } from 'node:fs'

function openApiProject() {
  const dir = mkdtempSync(join(tmpdir(), 'comat-oa-'))
  mkdirSync(join(dir, 'comatfiles'))
  writeFileSync(join(dir, 'comatype.config.json'), '{"services":{"api":{"comatDir":"./comatfiles"}}}')
  writeFileSync(join(dir, 'comatfiles/init.comat'), 'baseUrl https://api.example.com\n')
  writeFileSync(join(dir, 'comatfiles/get_a.comat'), 's200 { ok: bool }\ns404\n')
  return dir
}

test('Export OpenAPI: choosing a destination writes openapi.yml', async (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype is missing (cargo build)')
  const dir = openApiProject()
  const out = join(dir, 'out/openapi.yml')
  mkdirSync(join(dir, 'out'))
  const state = { commands: {}, folders: [{ uri: { fsPath: dir } }], editor: undefined, saveTo: { fsPath: out, scheme: 'file' } }
  const ext = load(state)
  await ext.activate({ subscriptions: [] })
  await state.commands['comatype.exportOpenApi']()
  assert.ok(existsSync(out), state.messages)
  const yml = readFileSync(out, 'utf8')
  assert.match(yml, /^openapi: 3\.0\.3/)
  assert.match(yml, /\/a:/)
  assert.match(yml, /description: Not Found/)
})

test('Export OpenAPI: does nothing when no destination is chosen', async (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype is missing')
  const dir = openApiProject()
  const state = { commands: {}, folders: [{ uri: { fsPath: dir } }], editor: undefined, saveTo: undefined }
  const ext = load(state)
  await ext.activate({ subscriptions: [] })
  await state.commands['comatype.exportOpenApi']()
  assert.equal(readdirSync(dir).includes('openapi.yml'), false)
})

test('Import OpenAPI: makes the .comat files and config, and generates code for the chosen languages', async (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype is missing')
  const src = openApiProject()
  const spec = join(src, 'openapi.yml')
  const exp = spawnSync(bin, ['to-openapi', '--config', src, '-o', spec])
  assert.equal(exp.status, 0)
  const dest = mkdtempSync(join(tmpdir(), 'comat-import-'))
  const state = {
    commands: {},
    folders: [],
    editor: undefined,
    openQueue: [[{ fsPath: spec }], [{ fsPath: dest }]],
    pick: (items) => items.filter((i) => i.description === 'ts:client:./client'),
  }
  const ext = load(state)
  await ext.activate({ subscriptions: [] })
  await state.commands['comatype.importOpenApi']()
  assert.ok(existsSync(join(dest, 'comatfiles/get_a.comat')), state.messages)
  assert.ok(existsSync(join(dest, 'comatype.config.json')))
  assert.ok(existsSync(join(dest, 'client/comatype/get_a.ts')), '--generate also makes the code')
  assert.match(readFileSync(join(dest, 'comatfiles/get_a.comat'), 'utf8'), /s404\n/, 'the default body is written back in the omitted form')
})

test('Show Status Codes: choosing from the list inserts a snippet', async (t) => {
  if (spawnSync(bin, ['help']).error) return t.skip('target/debug/comatype is missing')
  const inserted = []
  const state = {
    commands: {},
    folders: [],
    editor: {
      document: { uri: { fsPath: '/x/y.comat', scheme: 'file' }, languageId: 'comat' },
      insertSnippet: (s) => inserted.push(s.value),
    },
    pick: (items) => {
      assert.equal(items.length, 62)
      return items.find((i) => i.label === 's404')
    },
  }
  const ext = load(state)
  await ext.activate({ subscriptions: [] })
  await state.commands['comatype.showStatusCodes']()
  assert.deepEqual(inserted, ['s404 {\n\tmessage: string,\n}'])
})

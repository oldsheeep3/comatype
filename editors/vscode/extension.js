// Comatype VS Code extension: diagnostics (comatype check), commands, import links

const vscode = require('vscode')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { findConfig, parseDiagnostics, importLinks, exportOpenApiArgs, importOpenApiArgs, TARGET_PRESETS, CONFIG_NAME } = require('./lib')

function activate(context) {
  registerCommonCommands(context)
  const useServer = vscode.workspace.getConfiguration('comatype').get('languageServer.enabled')
  if (useServer) return activateWithServer(context)
  return activateWithoutServer(context)
}

/** 言語サーバ（comatype lsp）を起動して、クライアントとして繋ぐ */
function activateWithServer(context) {
  const { LanguageClient } = require('vscode-languageclient/node')
  const output = vscode.window.createOutputChannel('Comatype')
  context.subscriptions.push(output)
  const settings = () => vscode.workspace.getConfiguration('comatype')
  let client

  async function start() {
    client = new LanguageClient(
      'comatype',
      'Comatype',
      { command: settings().get('path') || 'comatype', args: ['lsp'] },
      { documentSelector: [{ scheme: 'file', language: 'comat' }], outputChannel: output },
    )
    await client.start()
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('comatype.restartServer', async () => {
      if (client) await client.stop()
      await start()
    }),
    vscode.commands.registerCommand('comatype.check', async () => {
      // Diagnostics are published on every keystroke, so restart the server and check again from scratch
      if (client) await client.stop()
      await start()
    }),
    vscode.commands.registerCommand('comatype.generate', () => runGenerate(output)),
    {
      dispose() {
        return client?.stop()
      },
    },
  )
  return start().catch((e) => {
    output.appendLine(`言語サーバを起動できません: ${e?.message ?? e}（設定 comatype.path で comatype の場所を指定してください）`)
    vscode.window.showErrorMessage('Comatype: 言語サーバ（comatype lsp）を起動できません。設定 comatype.path を確認してください。')
  })
}

/** comatype を実行して、{ code, stdout, stderr } を返す */
function runComatype(args, cwd) {
  const { spawn } = require('node:child_process')
  const bin = vscode.workspace.getConfiguration('comatype').get('path') || 'comatype'
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const child = spawn(bin, args, { cwd })
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: String(e.message ?? e) }))
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

function configForActiveEditor() {
  const explicit = vscode.workspace.getConfiguration('comatype').get('config')
  if (explicit) return path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.', explicit)
  const uri = vscode.window.activeTextEditor?.document.uri
  const starts = [uri && path.dirname(uri.fsPath), ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath)].filter(Boolean)
  return starts.map((d) => findConfig(d)).find(Boolean)
}

/** 言語サーバの有無によらず使えるコマンド: OpenAPI の書き出し・取り込み、ステータスコードの一覧 */
function registerCommonCommands(context) {
  const output = vscode.window.createOutputChannel('Comatype (commands)')
  context.subscriptions.push(output)

  context.subscriptions.push(
    vscode.commands.registerCommand('comatype.exportOpenApi', async () => {
      const config = configForActiveEditor()
      if (!config) return vscode.window.showWarningMessage(`${CONFIG_NAME} が見つかりません`)
      const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(path.dirname(config), 'openapi.yml')),
        filters: { OpenAPI: ['yml', 'yaml', 'json'] },
        saveLabel: 'OpenAPI を書き出す',
      })
      if (!target) return
      output.show(true)
      const args = exportOpenApiArgs(config, target.fsPath)
      output.appendLine(`$ comatype ${args.join(' ')}`)
      const res = await runComatype(args, path.dirname(config))
      output.appendLine(res.stderr.trimEnd())
      if (res.code !== 0) return vscode.window.showErrorMessage('Comatype: OpenAPI を書き出せませんでした（出力を見てください）')
      const open = await vscode.window.showInformationMessage(`Comatype: ${path.basename(target.fsPath)} を書き出しました`, '開く')
      if (open) vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target))
    }),

    vscode.commands.registerCommand('comatype.importOpenApi', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { OpenAPI: ['yml', 'yaml', 'json'] },
        openLabel: '取り込む OpenAPI',
      })
      if (!picked?.[0]) return
      const folder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        openLabel: '.comat を作るフォルダ',
      })
      if (!folder?.[0]) return
      const chosen = await vscode.window.showQuickPick(
        TARGET_PRESETS.map((t) => ({ label: t.label, description: `${t.lang}:${t.role}:${t.root}`, t })),
        { canPickMany: true, placeHolder: '続けてコードを生成するなら選ぶ（選ばなければ .comat と設定ファイルだけ作る）' },
      )
      if (!chosen) return
      const targets = chosen.map((c) => c.t)
      output.show(true)
      const args = importOpenApiArgs(picked[0].fsPath, folder[0].fsPath, targets, targets.length > 0, false)
      output.appendLine(`$ comatype ${args.join(' ')}`)
      let res = await runComatype(args, folder[0].fsPath)
      if (res.code !== 0 && /既にあります/.test(res.stderr)) {
        const ok = await vscode.window.showWarningMessage(
          'comatfiles か comatype.config.json が既にあります。上書きしますか？',
          { modal: true },
          '上書きする',
        )
        if (!ok) return
        res = await runComatype(importOpenApiArgs(picked[0].fsPath, folder[0].fsPath, targets, targets.length > 0, true), folder[0].fsPath)
      }
      output.appendLine(res.stderr.trimEnd())
      if (res.code !== 0) return vscode.window.showErrorMessage('Comatype: OpenAPI を取り込めませんでした（出力を見てください）')
      vscode.window.showInformationMessage(
        targets.length ? 'Comatype: .comat を作って、コードを生成しました' : 'Comatype: .comat と comatype.config.json を作りました',
      )
    }),

    vscode.commands.registerCommand('comatype.showStatusCodes', async () => {
      const config = configForActiveEditor()
      const res = await runComatype(
        ['statuses', '--json', ...(config ? ['--config', config] : [])],
        config ? path.dirname(config) : undefined,
      )
      if (res.code !== 0) return vscode.window.showErrorMessage('Comatype: ステータスコードの一覧を取れませんでした')
      const list = JSON.parse(res.stdout)
      const item = await vscode.window.showQuickPick(
        list.map((s) => ({
          label: `s${s.status}`,
          description: s.message + (s.body ? '' : '（本文なし）') + (s.custom ? '（追加）' : ''),
          snippet: s.body ? `s${s.status} {\n\tmessage: string,\n}` : `s${s.status} none`,
        })),
        { placeHolder: '挿入するステータスコード' },
      )
      const editor = vscode.window.activeTextEditor
      if (item && editor) editor.insertSnippet(new vscode.SnippetString(item.snippet))
    }),
  )
}

/** comatype generate（言語サーバの有無によらず使える） */
async function runGenerate(output) {
  const { spawn } = require('node:child_process')
  const uri = vscode.window.activeTextEditor?.document.uri
  const settings = vscode.workspace.getConfiguration('comatype')
  const explicit = settings.get('config')
  const config = explicit
    ? path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.', explicit)
    : [uri && path.dirname(uri.fsPath), ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath)]
        .filter(Boolean)
        .map((d) => findConfig(d))
        .find(Boolean)
  if (!config) {
    vscode.window.showWarningMessage(`${CONFIG_NAME} が見つかりません`)
    return
  }
  output.show(true)
  output.appendLine(`$ comatype generate --config ${config}`)
  const bin = settings.get('path') || 'comatype'
  const res = await new Promise((resolve) => {
    let stderr = ''
    const child = spawn(bin, ['generate', '--config', config], { cwd: path.dirname(config) })
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e) => resolve({ code: -1, stderr: String(e.message ?? e) }))
    child.on('close', (code) => resolve({ code, stderr }))
  })
  output.appendLine(res.stderr.trimEnd())
  if (res.code === 0) vscode.window.showInformationMessage('Comatype: 生成しました')
  else vscode.window.showErrorMessage('Comatype: 生成に失敗しました（出力を見てください）')
}

/** 言語サーバを使わない従来の方法: 保存時に comatype check を実行して、診断を出す */
function activateWithoutServer(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('comatype')
  const output = vscode.window.createOutputChannel('Comatype')
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0)
  status.command = 'comatype.check'
  context.subscriptions.push(diagnostics, output, status)

  const settings = () => vscode.workspace.getConfiguration('comatype')

  /** この uri（無ければ開いているエディタ、ワークスペース）の設定ファイルを探す */
  function locateConfig(uri) {
    const explicit = settings().get('config')
    if (explicit) return path.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.', explicit)
    const starts = []
    if (uri) starts.push(path.dirname(uri.fsPath))
    const active = vscode.window.activeTextEditor?.document.uri
    if (active?.scheme === 'file') starts.push(path.dirname(active.fsPath))
    for (const f of vscode.workspace.workspaceFolders ?? []) starts.push(f.uri.fsPath)
    for (const s of starts) {
      const found = findConfig(s)
      if (found) return found
    }
    return undefined
  }

  function run(args, cwd) {
    return new Promise((resolve) => {
      const bin = settings().get('path') || 'comatype'
      let stdout = ''
      let stderr = ''
      const child = spawn(bin, args, { cwd })
      child.stdout.on('data', (d) => (stdout += d))
      child.stderr.on('data', (d) => (stderr += d))
      child.on('error', (e) => resolve({ code: -1, stdout, stderr: String(e.message ?? e), failedToStart: true }))
      child.on('close', (code) => resolve({ code, stdout, stderr }))
    })
  }

  // If another request comes in while running, run once more after it finishes (so it does not stop on a stale result even when saves keep coming)
  let running = false
  let again
  async function check(uri) {
    if (running) {
      again = uri
      return
    }
    running = true
    try {
      await checkOnce(uri)
    } finally {
      running = false
    }
    if (again !== undefined) {
      const next = again
      again = undefined
      await check(next)
    }
  }

  async function checkOnce(uri) {
    const config = locateConfig(uri)
    if (!config) {
      diagnostics.clear()
      status.hide()
      return
    }
    status.text = '$(sync~spin) Comatype'
    status.show()
    const baseDir = path.dirname(config)
    const res = await run(['check', '--config', config], baseDir)
    if (res.failedToStart) {
      status.text = '$(warning) Comatype'
      status.tooltip = `comatype を実行できません: ${res.stderr}（設定 comatype.path で場所を指定してください）`
      output.appendLine(status.tooltip)
      return
    }
    const found = parseDiagnostics(res.stderr, baseDir)
    const byFile = new Map()
    for (const d of found) {
      const range = new vscode.Range(d.line, d.col, d.line, Number.MAX_SAFE_INTEGER)
      const diag = new vscode.Diagnostic(
        range,
        d.message,
        d.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
      )
      diag.source = 'comatype'
      if (!byFile.has(d.file)) byFile.set(d.file, [])
      byFile.get(d.file).push(diag)
    }
    diagnostics.clear()
    for (const [file, list] of byFile) diagnostics.set(vscode.Uri.file(file), list)
    const errors = found.filter((d) => d.severity === 'error').length
    const warnings = found.length - errors
    status.text = errors ? `$(error) Comatype ${errors}` : warnings ? `$(warning) Comatype ${warnings}` : '$(check) Comatype'
    status.tooltip = `comatype check: エラー ${errors} 件、警告 ${warnings} 件（クリックで再実行）`
  }

  async function generate(uri) {
    const config = locateConfig(uri)
    if (!config) {
      vscode.window.showWarningMessage(`${CONFIG_NAME} が見つかりません`)
      return
    }
    output.show(true)
    output.appendLine(`$ comatype generate --config ${config}`)
    const res = await run(['generate', '--config', config], path.dirname(config))
    output.appendLine(res.stderr.trimEnd())
    if (res.stdout) output.appendLine(res.stdout.trimEnd())
    if (res.code === 0) vscode.window.showInformationMessage('Comatype: 生成しました')
    else vscode.window.showErrorMessage('Comatype: 生成に失敗しました（出力を見てください）')
    await check(uri)
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('comatype.restartServer', () => {
      vscode.window.showInformationMessage('Comatype: 言語サーバは使っていません（設定 comatype.languageServer.enabled）')
    }),
    vscode.commands.registerCommand('comatype.check', () => check(vscode.window.activeTextEditor?.document.uri)),
    vscode.commands.registerCommand('comatype.generate', () => generate(vscode.window.activeTextEditor?.document.uri)),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === 'comat' && settings().get('checkOnSave')) check(doc.uri)
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId === 'comat' && settings().get('checkOnSave')) check(doc.uri)
    }),
    // Click the path of an import statement to open it
    vscode.languages.registerDocumentLinkProvider(
      { language: 'comat' },
      {
        provideDocumentLinks(doc) {
          const dir = path.dirname(doc.uri.fsPath)
          return importLinks(doc.getText()).map((l) => {
            const link = new vscode.DocumentLink(
              new vscode.Range(l.line, l.start, l.line, l.end),
              vscode.Uri.file(path.resolve(dir, l.target)),
            )
            link.tooltip = `${l.target} を開く`
            return link
          })
        },
      },
    ),
  )

  if (vscode.window.activeTextEditor?.document.languageId === 'comat' && settings().get('checkOnSave')) {
    check(vscode.window.activeTextEditor.document.uri)
  }
}

function deactivate() {}

module.exports = { activate, deactivate }

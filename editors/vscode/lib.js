// The parts that do not depend on VS Code (split out so they can be tested)

const fs = require('node:fs')
const path = require('node:path')

const CONFIG_NAME = 'comatype.config.json'

/** Looks for comatype.config.json upwards from startDir. Returns undefined if there is none */
function findConfig(startDir, exists = fs.existsSync) {
  let dir = path.resolve(startDir)
  for (;;) {
    const candidate = path.join(dir, CONFIG_NAME)
    if (exists(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

const WITH_POS = /^(.+?):(\d+):(\d+): (error|warning): (.*)$/
const NO_POS = /^(.+?): (error|warning): (.*)$/
// New format: `[warn]  comatfiles/get_user.comat:5:1  message` (two spaces between location and message). `[info]` is not a diagnostic
const TAG_WITH_POS = /^\[(error|warn)\]\s+(.+?):(\d+):(\d+)\s{2}(.*)$/
const TAG_NO_POS = /^\[(error|warn)\]\s+(\S.*?)\s{2}(.*)$/
const severityOf = (tag) => (tag === 'warn' ? 'warning' : tag)

/**
 * Turns the output of `comatype check` (standard error) into diagnostics.
 * Lines look like `[warn]  comatfiles/get_user.comat:5:1  message` (the old form `comatfiles/get_user.comat:5:1: warning: ...` is read too; paths are relative to the directory of the config file).
 * line / col in the result are 0-based. A diagnostic without a position has line = 0, col = 0.
 */
function parseDiagnostics(output, baseDir) {
  const out = []
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trimEnd()
    let m = TAG_WITH_POS.exec(line)
    if (m) {
      out.push({
        file: path.resolve(baseDir, m[2]),
        line: Number(m[3]) - 1,
        col: Math.max(0, Number(m[4]) - 1),
        severity: severityOf(m[1]),
        message: m[5],
      })
      continue
    }
    m = TAG_NO_POS.exec(line)
    if (m) {
      out.push({ file: path.resolve(baseDir, m[2]), line: 0, col: 0, severity: severityOf(m[1]), message: m[3] })
      continue
    }
    m = WITH_POS.exec(line)
    if (m) {
      out.push({
        file: path.resolve(baseDir, m[1]),
        line: Number(m[2]) - 1,
        col: Math.max(0, Number(m[3]) - 1),
        severity: m[4],
        message: m[5],
      })
      continue
    }
    m = NO_POS.exec(line)
    if (m && !/^(\d+ error|OK)/.test(line)) {
      out.push({ file: path.resolve(baseDir, m[1]), line: 0, col: 0, severity: m[2], message: m[3] })
    }
  }
  return out
}

const IMPORT = /^(\s*import\s+[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*\s+from\s+)(\S+)/

/** The position of the path in an import statement; it becomes a link that opens the file. */
function importLinks(text) {
  const links = []
  text.split(/\r?\n/).forEach((line, i) => {
    const m = IMPORT.exec(line)
    if (m) links.push({ line: i, start: m[1].length, end: m[1].length + m[2].length, target: m[2] })
  })
  return links
}

/** Arguments of `comatype to-openapi` */
function exportOpenApiArgs(config, outFile, service) {
  return ['to-openapi', '--config', config, '-o', outFile, ...(service ? ['--service', service] : [])]
}

/**
 * Arguments of `comatype from-openapi`. targets is an array of { lang, role, root }. If generate is true, code is generated afterwards
 * (code cannot be generated without targets, so generate is false then)
 */
function importOpenApiArgs(file, outDir, targets, generate, force) {
  const args = ['from-openapi', file, '--out', outDir]
  for (const t of targets) args.push('--target', `${t.lang}:${t.role}:${t.root}`)
  if (generate && targets.length > 0) args.push('--generate')
  if (force) args.push('--force')
  return args
}

/** Code generation targets that can be chosen on import (lang:role:root) */
const TARGET_PRESETS = [
  { label: 'TypeScript client', lang: 'ts', role: 'client', root: './client' },
  { label: 'TypeScript server', lang: 'ts', role: 'server', root: './server' },
  { label: 'Go client', lang: 'go', role: 'client', root: './go-client' },
  { label: 'Go server', lang: 'go', role: 'server', root: './go-server' },
  { label: 'Python client', lang: 'python', role: 'client', root: './py-client' },
  { label: 'Python server', lang: 'python', role: 'server', root: './py-server' },
]

module.exports = { findConfig, parseDiagnostics, importLinks, exportOpenApiArgs, importOpenApiArgs, TARGET_PRESETS, CONFIG_NAME }

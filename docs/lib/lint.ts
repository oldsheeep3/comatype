// A small browser-side check for the Playground.
// The real checks (type resolution, matching path against params, route duplicates, ...) are done by `comatype check` and the VS Code extension.
// This only looks at bracket matching and the status-code rules (is the code registered, can it have a body).

import type { Locale } from './i18n'

export interface StatusInfo {
  status: number
  message: string
  body: boolean
}

export interface Problem {
  /** 1-based */
  line: number
  /** 1-based */
  column: number
  endColumn: number
  message: string
  severity: 'error' | 'warning'
}

const OPEN: Record<string, string> = { '{': '}', '(': ')' }
const CLOSE: Record<string, string> = { '}': '{', ')': '(' }

const messages = {
  en: {
    unmatchedClose: (c: string) => `No matching ${c}`,
    unmatchedOpen: (c: string) => `Missing ${c}`,
    unknownStatus: (code: number) => `Status code ${code} is not defined (only standard codes and codes added with additionalStatusCodes in comatype.config.json can be used)`,
    noBody: (code: number) => `Status ${code} cannot have a body (write \`s${code} none\`, or omit the type)`,
  },
  'ja-jp': {
    unmatchedClose: (c: string) => `対応する ${c} がありません`,
    unmatchedOpen: (c: string) => `${c} が足りません`,
    unknownStatus: (code: number) => `ステータスコード ${code} は未定義です（標準のコードか、comatype.config.json の additionalStatusCodes で足したコードだけ使えます）`,
    noBody: (code: number) => `ステータス ${code} はボディを持てません（\`s${code} none\` と書くか、型を省略してください）`,
  },
}

export function lintComat(text: string, statuses: StatusInfo[], locale: Locale = 'en'): Problem[] {
  const msg = messages[locale]
  const table = new Map(statuses.map((s) => [s.status, s]))
  const problems: Problem[] = []
  const stack: { ch: string; line: number; column: number }[] = []

  const lines = text.split('\n')
  lines.forEach((line, i) => {
    const lineNo = i + 1
    // Bracket matching (strings and comments are skipped)
    let quote: string | null = null
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]
      if (quote) {
        if (ch === '\\') c++
        else if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'") quote = ch
      else if (ch === '/' && line[c + 1] === '/') break
      else if (OPEN[ch]) stack.push({ ch, line: lineNo, column: c + 1 })
      else if (CLOSE[ch]) {
        const top = stack.pop()
        if (!top || top.ch !== CLOSE[ch]) {
          problems.push({ line: lineNo, column: c + 1, endColumn: c + 2, message: msg.unmatchedClose(CLOSE[ch]), severity: 'error' })
          if (top && top.ch !== CLOSE[ch]) stack.push(top)
        }
      }
    }

    // Status codes: statements that start with `s404`
    const m = /^(\s*)s(\d{3})\b(?!\s*\??\s*:)(.*)$/.exec(line)
    if (m) {
      const code = Number(m[2])
      const column = m[1].length + 1
      const info = table.get(code)
      if (!info) {
        problems.push({
          line: lineNo,
          column,
          endColumn: column + 4,
          message: msg.unknownStatus(code),
          severity: 'error',
        })
      } else if (!info.body) {
        const rest = m[3].replace(/\/\/.*$/, '').trim()
        if (rest !== '' && !rest.startsWith(',') && !/^none\b/.test(rest)) {
          problems.push({
            line: lineNo,
            column,
            endColumn: line.length + 1,
            message: msg.noBody(code),
            severity: 'error',
          })
        }
      }
    }
  })

  for (const open of stack) {
    problems.push({ line: open.line, column: open.column, endColumn: open.column + 1, message: msg.unmatchedOpen(OPEN[open.ch]), severity: 'error' })
  }
  return problems.sort((a, b) => a.line - b.line || a.column - b.column)
}

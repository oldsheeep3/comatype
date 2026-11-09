// Applies the grammar for real with vscode-textmate and extracts the tokens
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vscodeTextmate from 'vscode-textmate'
import vscodeOniguruma from 'vscode-oniguruma'

const { Registry, parseRawGrammar, INITIAL } = vscodeTextmate
const { loadWASM, OnigScanner, OnigString } = vscodeOniguruma
const require = createRequire(import.meta.url)

await loadWASM(readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer)

const grammarPath = fileURLToPath(new URL('../syntaxes/comat.tmLanguage.json', import.meta.url))
const registry = new Registry({
  onigLib: Promise.resolve({
    createOnigScanner: (sources) => new OnigScanner(sources),
    createOnigString: (s) => new OnigString(s),
  }),
  loadGrammar: async (scope) =>
    scope === 'source.comat' ? parseRawGrammar(readFileSync(grammarPath, 'utf8'), grammarPath) : null,
})
export const grammar = await registry.loadGrammar('source.comat')

/** テキストを行ごとにトークン化する。戻り値: 行 → [{ text, scopes: ['source.comat', ...] }] */
export function tokenize(text) {
  let ruleStack = INITIAL
  return text.split('\n').map((line) => {
    const r = grammar.tokenizeLine(line, ruleStack)
    ruleStack = r.ruleStack
    return r.tokens.map((t) => ({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes }))
  })
}

/** 1 行の中の、text に一致するトークンのスコープ（最も内側のもの）。無ければ undefined */
export function scopeOf(line, text, nth = 0) {
  const hits = tokenize(line)[0].filter((t) => t.text === text)
  return hits[nth]?.scopes.at(-1)
}

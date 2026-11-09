// Load the `.comat` grammar (the same TextMate grammar as the VS Code extension) into Monaco Editor.
// Read the TextMate grammar with shiki and turn it into a Monaco tokenizer with @shikijs/monaco. Works in the browser only.
import type * as Monaco from 'monaco-editor'
import languageConfig from '../../editors/vscode/language-configuration.json'
import grammar from '../../editors/vscode/syntaxes/comat.tmLanguage.json'

export const LIGHT_THEME = 'github-light'
export const DARK_THEME = 'github-dark'

let loading: Promise<typeof Monaco> | undefined

/** Load Monaco (initialized only once) */
export function loadMonaco(): Promise<typeof Monaco> {
  loading ??= (async () => {
    const [monaco, shiki, shikiMonaco] = await Promise.all([
      import('monaco-editor/editor/editor.main.js') as Promise<typeof Monaco>,
      import('shiki'),
      import('@shikijs/monaco'),
    ])
    // This editor has no language server, so only the basic workers are used
    ;(self as unknown as { MonacoEnvironment: Monaco.Environment }).MonacoEnvironment = {
      getWorker: () => new Worker(new URL('monaco-editor/editor/editor.worker.js', import.meta.url)),
    }

    const highlighter = await shiki.createHighlighter({
      themes: [LIGHT_THEME, DARK_THEME],
      langs: [{ ...grammar, name: 'comat' } as never],
    })
    monaco.languages.register({ id: 'comat', extensions: ['.comat'], aliases: ['Comatype', 'comat'] })
    const c = languageConfig
    monaco.languages.setLanguageConfiguration('comat', {
      comments: c.comments,
      brackets: c.brackets as Monaco.languages.CharacterPair[],
      autoClosingPairs: c.autoClosingPairs,
      surroundingPairs: c.surroundingPairs.map(([open, close]) => ({ open, close })),
      wordPattern: new RegExp(c.wordPattern),
      indentationRules: {
        increaseIndentPattern: new RegExp(c.indentationRules.increaseIndentPattern),
        decreaseIndentPattern: new RegExp(c.indentationRules.decreaseIndentPattern),
      },
    })
    shikiMonaco.shikiToMonaco(highlighter, monaco)
    return monaco
  })()
  return loading
}

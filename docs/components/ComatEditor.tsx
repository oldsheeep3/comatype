'use client'

import type * as Monaco from 'monaco-editor'
// Shows and edits `.comat` in Monaco Editor. The grammar is the same as the VS Code extension's (the TextMate grammar goes through shiki).
import { useEffect, useRef, useState } from 'react'
import { DARK_THEME, LIGHT_THEME, loadMonaco } from './monaco'

interface Props {
  value: string
  onChange?: (value: string) => void
  /** Called when Monaco is ready (e.g. to add markers). */
  onReady?: (monaco: typeof Monaco, editor: Monaco.editor.IStandaloneCodeEditor) => void
  readOnly?: boolean
  /** Height in px. When omitted, it follows the content (up to maxHeight). */
  height?: number
  maxHeight?: number
}

const isDark = () => document.documentElement.classList.contains('dark')

export function ComatEditor({ value, onChange, onReady, readOnly = false, height, maxHeight = 480 }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor>(undefined)
  const monacoRef = useRef<typeof Monaco>(undefined)
  const onChangeRef = useRef(onChange)
  const onReadyRef = useRef(onReady)
  onChangeRef.current = onChange
  onReadyRef.current = onReady
  const [px, setPx] = useState(height ?? 120)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    let disposed = false
    let observer: MutationObserver | undefined
    loadMonaco()
      .then((monaco) => {
        if (disposed || !host.current) return
        monacoRef.current = monaco
        const editor = monaco.editor.create(host.current, {
          value,
          language: 'comat',
          theme: isDark() ? DARK_THEME : LIGHT_THEME,
          readOnly,
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 14,
          folding: false,
          renderLineHighlight: readOnly ? 'none' : 'line',
          overviewRulerLanes: 0,
          tabSize: 4,
          insertSpaces: true,
          fixedOverflowWidgets: true,
          scrollbar: { alwaysConsumeMouseWheel: false },
        })
        editorRef.current = editor
        editor.onDidChangeModelContent(() => onChangeRef.current?.(editor.getValue()))
        if (height === undefined) {
          const fit = () => setPx(Math.min(editor.getContentHeight() + 8, maxHeight))
          editor.onDidContentSizeChange(fit)
          fit()
        }
        // Follow the page's dark mode switch
        observer = new MutationObserver(() => monaco.editor.setTheme(isDark() ? DARK_THEME : LIGHT_THEME))
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        setState('ready')
        onReadyRef.current?.(monaco, editor)
      })
      .catch((e) => {
        console.error('Cannot load Monaco', e)
        if (!disposed) setState('failed')
      })
    return () => {
      disposed = true
      observer?.disconnect()
      editorRef.current?.dispose()
      editorRef.current = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, readOnly, maxHeight, height])

  // When value changes from outside (switching the Playground example)
  useEffect(() => {
    const editor = editorRef.current
    if (editor && editor.getValue() !== value) editor.setValue(value)
  }, [value])

  return (
    <div className="comat-editor" style={{ height: px }}>
      <div ref={host} className="comat-editor-host" hidden={state !== 'ready'} />
      {state !== 'ready' && (
        <pre className="comat-editor-fallback">
          <code>{state === 'failed' ? `(the editor could not be loaded)\n${value}` : value}</code>
        </pre>
      )}
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import { useUi } from './useLocale'

/** Copies the code of the code block this button sits in. */
export function CopyButton() {
  const text = useUi()
  const ref = useRef<HTMLButtonElement>(null)
  const [done, setDone] = useState(false)

  async function copy() {
    const code = ref.current?.parentElement?.querySelector('pre code')?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(code)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch {
      /* do nothing when the clipboard is unavailable */
    }
  }

  return (
    <button ref={ref} type="button" className="copy" onClick={copy} aria-label={text.copyCode}>
      {done ? text.copied : text.copy}
    </button>
  )
}

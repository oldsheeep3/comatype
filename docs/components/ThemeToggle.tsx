'use client'

import { useEffect, useState } from 'react'
import { useUi } from './useLocale'

/** Light / dark toggle. The choice is stored in localStorage (the script in the layout applies it before first paint). */
export function ThemeToggle() {
  const text = useUi()
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), [])

  function toggle() {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      /* when storage is unavailable, the choice lasts for this page only */
    }
    setDark(next)
  }

  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggle}
      aria-label={dark ? text.light : text.dark}
      title={dark ? text.light : text.dark}
    >
      <span aria-hidden>{dark ? '☀' : '☾'}</span>
    </button>
  )
}

/** Inline script for <head> that avoids a flash: decides the theme before first paint. */
export const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

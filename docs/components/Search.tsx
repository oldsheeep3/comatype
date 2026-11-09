'use client'

import MiniSearch from 'minisearch'
import { useRouter } from 'next/navigation'
// Full-text search. Loads the search.json built at build time the first time it is opened and queries it with MiniSearch.
// Words are split with the browser's Intl.Segmenter (works for Japanese too).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { localePrefix } from '../lib/i18n'
import { useLocale, useUi } from './useLocale'

interface Entry {
  id: string
  url: string
  page: string
  heading: string
  text: string
}

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

function tokenizer(): (s: string) => string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('ja', { granularity: 'word' })
    return (s) => [...seg.segment(s)].filter((x) => x.isWordLike).map((x) => x.segment.toLowerCase())
  }
  return (s) =>
    s
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter(Boolean)
}

export function SearchButton() {
  const text = useUi()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <button type="button" className="search-button" onClick={() => setOpen(true)} aria-label={text.search}>
        <span aria-hidden>⌕</span> {text.search} <kbd>⌘K</kbd>
      </button>
      {open && <SearchModal onClose={() => setOpen(false)} />}
    </>
  )
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const text = useUi()
  const locale = useLocale()
  const [q, setQ] = useState('')
  const [index, setIndex] = useState<MiniSearch<Entry>>()
  const [failed, setFailed] = useState(false)
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    let alive = true
    fetch(`${base}${localePrefix(locale)}/search.json`)
      .then((r) => r.json() as Promise<Entry[]>)
      .then((entries) => {
        if (!alive) return
        const ms = new MiniSearch<Entry>({
          fields: ['heading', 'page', 'text'],
          storeFields: ['url', 'page', 'heading', 'text'],
          tokenize: tokenizer(),
          searchOptions: { prefix: true, fuzzy: 0.15, boost: { heading: 3, page: 2 } },
        })
        ms.addAll(entries)
        setIndex(ms)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [locale])

  const results = useMemo(() => (index && q.trim() ? index.search(q).slice(0, 12) : []), [index, q])
  useEffect(() => setCursor(0), [])

  const go = useCallback(
    (url: string) => {
      onClose()
      router.push(url)
    },
    [onClose, router],
  )

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && results[cursor]) go(String(results[cursor].url))
  }

  return (
    <div className="search-overlay" onClick={onClose} role="dialog" aria-modal aria-label={text.search}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={text.searchPlaceholder}
          className="search-input"
          aria-label={text.searchPlaceholder}
        />
        <ul className="search-results">
          {failed && <li className="muted">{text.searchFailed}</li>}
          {!failed && !index && <li className="muted">{text.searchLoading}</li>}
          {index && q.trim() && results.length === 0 && <li className="muted">{text.searchEmpty}</li>}
          {results.map((r, i) => (
            <li key={String(r.id)} className={i === cursor ? 'active' : ''} onMouseEnter={() => setCursor(i)}>
              <a
                href={`${base}${r.url}`}
                onClick={(e) => {
                  e.preventDefault()
                  go(String(r.url))
                }}
              >
                <strong>{String(r.page)}</strong>
                {r.heading && r.heading !== r.page && <span> › {String(r.heading)}</span>}
                <small>{String(r.text).slice(0, 90)}</small>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

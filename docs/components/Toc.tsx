'use client'

// Headings of this page (right column); highlights the heading being read as you scroll
import { useEffect, useState } from 'react'
import type { Heading } from '../lib/markdown'
import { useUi } from './useLocale'

export function Toc({ headings }: { headings: Heading[] }) {
  const text = useUi()
  const [active, setActive] = useState<string>()
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e)
    if (els.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-72px 0px -70% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [headings])

  if (headings.length === 0) return null
  return (
    <nav className="toc" aria-label={text.onThisPage}>
      <p className="toc-title">{text.onThisPage}</p>
      <ul>
        {headings.map((h) => (
          <li key={h.id} className={h.depth === 3 ? 'depth-3' : ''}>
            <a href={`#${h.id}`} className={active === h.id ? 'active' : ''}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

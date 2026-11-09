'use client'

// Tabs of `::: code-group`. The titles are put into data-titles on the server side
import { Children, useState, type ReactNode } from 'react'

export function CodeGroup({ children, 'data-titles': titlesJson }: { children?: ReactNode; 'data-titles'?: string }) {
  const titles: string[] = titlesJson ? JSON.parse(titlesJson) : []
  const panels = Children.toArray(children)
  const [active, setActive] = useState(0)
  return (
    <div className="code-group">
      <div className="tabs" role="tablist">
        {titles.map((t, i) => (
          <button key={`${t}-${i}`} type="button" role="tab" aria-selected={i === active} className={i === active ? 'active' : ''} onClick={() => setActive(i)}>
            {t}
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <div key={i} role="tabpanel" hidden={i !== active}>
          {p}
        </div>
      ))}
    </div>
  )
}

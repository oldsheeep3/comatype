'use client'

// The animated example on the landing page: the .comat file you write, then the generated client in each
// language (every language is shown for 2 seconds), and the TypeScript server.
import { useEffect, useState } from 'react'
import { clientSnippets, tokenize } from '../lib/hero-snippets'

export interface HeroDemoText {
  file: string
  fileNote: string
  generate: string
  langLabel: string
  pause: string
  play: string
  tablistLabel: string
  tabClient: string
  tabServer: string
  note: string
}

const SERVER = `⟦k|import⟧ { s } ⟦k|from⟧ ⟦s|'@comatype/typescript'⟧
⟦k|import⟧ { path, s200, s404 } ⟦k|from⟧ ⟦s|'@/comatype/user/put__id'⟧

s.⟦t|put⟧(path, (req) => {
  ⟦c|// req.params.id: string, req.body: UserData⟧
  ⟦k|const⟧ version = db.update(req.params.id, req.body)
  ⟦k|if⟧ (version === ⟦k|undefined⟧) {
    ⟦k|return⟧ ⟦t|s404⟧({ error: { code: ⟦s|'not_found'⟧, message: ⟦s|'user not found'⟧ } })
  }
  ⟦k|return⟧ ⟦t|s200⟧({ data: db.find(req.params.id), headers: { ⟦s|'X-Resource-Version'⟧: version } })
})`

type Tab = 'client' | 'server'

function Code({ source, className }: { source: string; className?: string }) {
  return (
    <pre className={className ? `demo-pre ${className}` : 'demo-pre'}>
      {tokenize(source).map((tk, i) => (
        <span key={i} className={tk.c}>
          {tk.t}
        </span>
      ))}
    </pre>
  )
}

export function HeroDemo({ text }: { text: HeroDemoText }) {
  const [tab, setTab] = useState<Tab>('client')
  const [li, setLi] = useState(0)
  const [auto, setAuto] = useState(true)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setAuto(false)
      return
    }
  }, [])
  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => setLi((i) => (i + 1) % clientSnippets.length), 2000)
    return () => clearInterval(id)
  }, [auto])

  const cur = clientSnippets[li]
  const tabs: { id: Tab; label: string }[] = [
    { id: 'client', label: text.tabClient },
    { id: 'server', label: text.tabServer },
  ]
  return (
    <div className="demo">
      <div className="demo-card">
        <div className="demo-file">
          {text.file} <span>· {text.fileNote}</span>
        </div>
        <Code
          className="demo-pinned"
          source={`⟦k|import⟧ ⟦t|UserData⟧ ⟦k|from⟧ ../../types/UserData.comat
⟦k|import⟧ ⟦t|ApiError⟧ ⟦k|from⟧ ../../types/common.comat

⟦k|params⟧ { id: ⟦t|uuidv4⟧ }
⟦k|body⟧ ⟦t|UserData⟧

⟦n|s200⟧ ⟦t|UserData⟧
⟦n|s404⟧ ⟦t|ApiError⟧`}
        />
        <div className="demo-gen">
          <span aria-hidden>↓</span> {text.generate} <i>→</i>
          <select
            aria-label={text.langLabel}
            value={cur.name}
            onChange={(e) => {
              setAuto(false)
              setTab('client')
              setLi(clientSnippets.findIndex((s) => s.name === e.target.value))
            }}
          >
            {clientSnippets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className="demo-auto" onClick={() => setAuto(!auto)}>
            {auto ? text.pause : text.play}
          </button>
        </div>
        <div role="tablist" aria-label={text.tablistLabel} className="demo-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'client' && (
          <div key={li}>
            {auto && (
              <div className="demo-progress">
                <div />
              </div>
            )}
            <Code className="demo-in" source={cur.code} />
          </div>
        )}
        {tab === 'server' && <Code source={SERVER} />}
      </div>
      <p className="demo-note">{text.note}</p>
    </div>
  )
}

'use client'

// Status code list. data/status-codes.json is generated from the registry (`comatype statuses`) by `pnpm gen:status`
import { useMemo, useState } from 'react'
import statuses from '../data/status-codes.json'
import { useUi } from './useLocale'

export function StatusTable() {
  const text = useUi()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return statuses.filter((s) => !needle || `s${s.status} ${s.status} ${s.message}`.toLowerCase().includes(needle))
  }, [q])

  return (
    <div className="status-table">
      <input
        className="search-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={text.statusFilterPlaceholder}
        aria-label={text.statusFilterLabel}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{text.statusCode}</th>
              <th>{text.statusMessage}</th>
              <th>{text.statusBody}</th>
              <th>{text.statusDefault}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.status}>
                <td>
                  <code>s{s.status}</code>
                </td>
                <td>{s.message}</td>
                <td>{s.body ? text.statusCanHaveBody : text.statusNoBody}</td>
                <td>
                  <code>{s.body ? `s${s.status} { message: string }` : `s${s.status} none`}</code>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4}>{text.statusNone}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted">
        {rows.length} / {statuses.length}
      </p>
    </div>
  )
}

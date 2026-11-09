// Landing page (LP), shared by both locales.
import Link from 'next/link'
import { type Locale, withLocale } from '../lib/i18n'
import { home, languages, matrix } from '../lib/home-content'
import { renderMarkdown } from '../lib/markdown'

const TERMINAL = `── wrap: none ──
GET /health

── wrap: auth > admin ──
DELETE /admin/:id
GET /admin/users

── wrap: log > auth ──
GET /app/me
PUT /app/settings

── wrap: log > auth > tenant ──
GET /app/tenant/projects`

export async function Home({ locale }: { locale: Locale }) {
  const c = home[locale]
  const example = await renderMarkdown(`
::: code-group

<<< @/../usage/comatfiles/user/put_[id].comat [${c.tabComat}]

<<< @/../usage/node_client/api.ts#put-user [${c.tabClient}]

<<< @/../usage/node_server/user_put_id.ts [${c.tabServer}]

:::
`, locale)
  const to = (p: string) => withLocale(locale, p)
  return (
    <main className="home lp">
      <section className="hero">
        <p className="eyebrow">{c.eyebrow}</p>
        <h1>
          <span className="gradient">{c.title}</span>
        </h1>
        <p className="hero-tagline">{c.tagline}</p>
        <div className="hero-actions">
          <Link href={to('/guide/getting-started/')} className="button brand">
            {c.start}
          </Link>
          <Link href={to('/playground/')} className="button">
            {c.playground}
          </Link>
          <Link href={to('/reference/cli/')} className="button">
            {c.reference}
          </Link>
        </div>
        <div className="install">
          <span>{c.installLabel}</span>
          <code>cargo install --path crates/comatype-cli</code>
        </div>
        <p className="lang-label">{c.languagesLabel}</p>
        <ul className="lang-chips" aria-label={c.languagesLabel}>
          {languages.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <section className="home-example">
        <h2>{c.exampleTitle}</h2>
        <p className="lead">{c.exampleLead}</p>
        <div className="doc">{example.content}</div>
      </section>

      <section className="lp-section">
        <h2>{c.featuresTitle}</h2>
        <div className="features">
          {c.features.map((f) => (
            <div key={f.title} className="feature">
              <span className="feature-icon" aria-hidden>
                {f.icon}
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2>{c.stepsTitle}</h2>
        <ol className="steps">
          {c.steps.map((s, i) => (
            <li key={s.title}>
              <span className="step-num">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <pre>
                <code>{s.code}</code>
              </pre>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section">
        <h2>{c.matrixTitle}</h2>
        <p className="lead">{c.matrixLead}</p>
        <div className="table-wrap">
          <table className="matrix">
            <thead>
              <tr>
                {c.matrixHead.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((m) => (
                <tr key={m.lang}>
                  <td>
                    <strong>{m.lang}</strong>
                  </td>
                  <td className="yes">✓</td>
                  <td className="yes">✓</td>
                  <td>{m.deps[locale]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted center">{c.matrixNote}</p>
      </section>

      <section className="lp-section tools">
        <h2>{c.toolsTitle}</h2>
        <p className="lead">{c.toolsLead}</p>
        <div className="tools-grid">
          <ul>
            {c.tools.map((t) => (
              <li key={t.cmd}>
                <code>{t.cmd}</code>
                <p>{t.body}</p>
              </li>
            ))}
          </ul>
          <div className="terminal" role="img" aria-label={c.terminalTitle}>
            <div className="terminal-bar">
              <i />
              <i />
              <i />
              <span>{c.terminalTitle}</span>
            </div>
            <pre>{TERMINAL}</pre>
          </div>
        </div>
      </section>

      <section className="cta">
        <h2>{c.ctaTitle}</h2>
        <p>{c.ctaBody}</p>
        <div className="hero-actions">
          <Link href={to('/guide/getting-started/')} className="button brand">
            {c.start}
          </Link>
          <Link href={to('/playground/')} className="button">
            {c.playground}
          </Link>
        </div>
      </section>
    </main>
  )
}

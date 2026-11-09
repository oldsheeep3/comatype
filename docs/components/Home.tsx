// Landing page (LP), shared by both locales.
import Link from 'next/link'
import { langLogo } from '../lib/hero-snippets'
import { home, languages, matrix } from '../lib/home-content'
import { type Locale, withLocale } from '../lib/i18n'
import { HeroDemo } from './HeroDemo'

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

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const INSTALL = 'curl -fsSL https://raw.githubusercontent.com/oldsheeep3/comatype/main/install.sh | sh'

export function Home({ locale }: { locale: Locale }) {
  const c = home[locale]
  const to = (p: string) => withLocale(locale, p)
  return (
    <main className="home lp">
      <section className="lp-hero">
        <div className="lp-hero-text">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1>
            {c.title.slice(0, c.title.length - c.titleAccent.length)}
            <span>{c.titleAccent}</span>
          </h1>
          <p className="hero-tagline">{c.tagline}</p>
          <div className="lp-actions">
            <div className="lp-actions-row">
              <Link href={to('/guide/getting-started/')} className="btn primary">
                {c.start}
              </Link>
              <Link href={to('/playground/')} className="btn">
                {c.playground}
              </Link>
            </div>
            <Link href={to('/reference/cli/')} className="lp-ref">
              {c.reference} →
            </Link>
          </div>
          <div className="install">
            <span>{c.installLabel}</span>
            <code>$ {INSTALL}</code>
          </div>
        </div>
        <HeroDemo text={c.demo} />
      </section>

      <section className="lang-strip" aria-label={c.languagesLabel}>
        <div className="lang-strip-inner">
          <span>{c.languagesLabel}</span>
          <ul>
            {languages.map((l) => (
              <li key={l}>
                <img className="lang-logo" src={`${base}/lang/${langLogo[l]}.svg`} alt="" width={22} height={22} />
                {l}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="lp-block" id="language">
        <h2>{c.featuresTitle}</h2>
        <div className="lp-features">
          {c.features.map((f) => (
            <div key={f.title}>
              <div className="lp-icon" aria-hidden>
                {f.icon}
              </div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-block" id="guide">
        <h2>{c.stepsTitle}</h2>
        <div className="lp-steps">
          {c.steps.map((s, i) => (
            <div key={s.title} className="lp-step">
              <div className="lp-step-text">
                <div className="lp-step-head">
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <h3>{s.title}</h3>
                </div>
                <p>{s.body}</p>
              </div>
              <pre>
                <code>{s.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-block" id="runtimes">
        <h2>{c.matrixTitle}</h2>
        <p className="lp-lead">{c.matrixLead}</p>
        <div className="lp-table">
          <table className="matrix">
            <thead>
              <tr>
                {c.matrixHead.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((m) => (
                <tr key={m.lang}>
                  <th scope="row">{m.lang}</th>
                  <td className="yes">✓</td>
                  <td className="yes">✓</td>
                  <td>{m.deps[locale]}</td>
                  <td>
                    <a href={m.registry.url} target="_blank" rel="noreferrer noopener">
                      {m.registry.name}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lp-note">{c.matrixNote}</p>
      </section>

      <section className="lp-block" id="reference">
        <div className="lp-cli">
          <div className="lp-cli-text">
            <h2>{c.toolsTitle}</h2>
            <p className="lp-lead">{c.toolsLead}</p>
            <ul className="lp-tools">
              {c.tools.map((t) => (
                <li key={t.cmd}>
                  <code>{t.cmd}</code>
                  <p>{t.body}</p>
                </li>
              ))}
            </ul>
            <Link href={to('/reference/cli/')} className="lp-ref">
              {c.reference} →
            </Link>
          </div>
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

      <section className="lp-cta">
        <h2>{c.ctaTitle}</h2>
        <p>{c.ctaBody}</p>
        <div className="lp-actions-row">
          <Link href={to('/guide/getting-started/')} className="btn inverse">
            {c.start}
          </Link>
          <Link href={to('/playground/')} className="btn outline">
            {c.playground}
          </Link>
        </div>
      </section>
    </main>
  )
}

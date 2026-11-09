// Site footer, shared by every page.
import Link from 'next/link'
import { languages } from '../lib/home-content'
import { type Locale, ui, withLocale } from '../lib/i18n'
import { nav } from '../lib/site'
import { Logo } from './Logo'

const runtimeSlug: Record<string, string> = {
  TypeScript: 'typescript-client',
  JavaScript: 'javascript',
  Go: 'go',
  Python: 'python',
  Rust: 'rust',
  Java: 'java',
  Kotlin: 'kotlin',
  Swift: 'swift',
  Ruby: 'ruby',
  'C#': 'csharp',
}

const repo = 'https://github.com/oldsheeep3/comatype'

export function Footer({ locale }: { locale: Locale }) {
  const t = ui[locale]
  const to = (p: string) => withLocale(locale, p)
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="logo">
            <Logo height={24} />
          </div>
          <p>{t.footerTagline}</p>
        </div>
        <nav className="footer-col" aria-label={t.footerDocs}>
          <h2>{t.footerDocs}</h2>
          {nav
            .filter((n) => n.href !== '/playground/')
            .map((n) => (
              <Link key={n.href} href={to(n.href)}>
                {n.text[locale]}
              </Link>
            ))}
        </nav>
        <nav className="footer-col" aria-label={t.footerLanguages}>
          <h2>{t.footerLanguages}</h2>
          <ul>
            {languages.map((l) => (
              <li key={l}>
                <Link href={to(`/runtime/${runtimeSlug[l]}/`)}>{l}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="footer-col" aria-label={t.footerProject}>
          <h2>{t.footerProject}</h2>
          <a href={repo} target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
          <a href="https://www.npmjs.com/package/@comatype/typescript" target="_blank" rel="noreferrer noopener">
            npm
          </a>
          <Link href={to('/guide/editor/')}>VS Code</Link>
          <Link href={to('/playground/')}>Playground</Link>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>{t.footer}</span>
        <span>{t.dartPlanned}</span>
        <a className="grow" href="#top">
          {t.backToTop}
        </a>
      </div>
    </footer>
  )
}

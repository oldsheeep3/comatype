'use client'

// The site menu that opens from the right on a phone (pages without a doc sidebar)
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { stripLocale, withLocale } from '../lib/i18n'
import { nav } from '../lib/site'
import { LanguageSwitch } from './LanguageSwitch'
import { SearchButton } from './Search'
import { useShell } from './Shell'
import { ThemeToggle } from './ThemeToggle'
import { useLocale, useUi } from './useLocale'

export function SiteDrawer() {
  const { navOpen, setNavOpen } = useShell()
  const pathname = stripLocale(usePathname() ?? '/')
  const locale = useLocale()
  const text = useUi()
  if (!navOpen) return null
  return (
    <>
      <div className="drawer-scrim" onClick={() => setNavOpen(false)} aria-hidden />
      <div id="site-menu" className="drawer right" role="dialog" aria-label={text.menu}>
        <div className="drawer-head">
          <span>{text.menu}</span>
          <button type="button" className="icon-button" style={{ border: 0 }} aria-label={text.close} onClick={() => setNavOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="m4 4 10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className="drawer-body" aria-label={text.mainNav}>
          <SearchButton />
          {nav.map((n) => (
            <Link key={n.href} href={withLocale(locale, n.href)} className={n.match && pathname.startsWith(n.match) ? 'active' : ''}>
              {n.text[locale]}
            </Link>
          ))}
        </nav>
        <div className="drawer-foot">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </div>
    </>
  )
}

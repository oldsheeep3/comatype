'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { stripLocale, withLocale } from '../lib/i18n'
import { nav, type SidebarGroup } from '../lib/site'
import { LanguageSwitch } from './LanguageSwitch'
import { useShell } from './Shell'
import { useLocale, useUi } from './useLocale'

export function SidebarNav({ groups }: { groups: SidebarGroup[] }) {
  const pathname = stripLocale(usePathname() ?? '/')
  const locale = useLocale()
  const text = useUi()
  const { menuOpen, setMenuOpen } = useShell()
  return (
    <>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden />}
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'} aria-label={text.pageList}>
        <div className="sidebar-head only-mobile">
          <span>{text.menu}</span>
          <button type="button" className="icon-button" style={{ border: 0 }} aria-label={text.close} onClick={() => setMenuOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="m4 4 10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="sidebar-nav-links only-mobile">
          {nav.map((n) => (
            <Link key={n.href} href={withLocale(locale, n.href)}>
              {n.text[locale]}
            </Link>
          ))}
        </div>
        {groups.map((g) => (
          <div key={g.text.en} className="sidebar-group">
            <p className="sidebar-title">{g.text[locale]}</p>
            <ul>
              {g.items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={withLocale(locale, it.href)}
                    className={pathname === it.href ? 'active' : ''}
                    aria-current={pathname === it.href ? 'page' : undefined}
                  >
                    {it.text[locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="sidebar-foot only-mobile">
          <LanguageSwitch />
        </div>
      </aside>
    </>
  )
}

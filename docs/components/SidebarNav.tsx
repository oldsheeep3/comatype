'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { stripLocale, withLocale } from '../lib/i18n'
import type { SidebarGroup } from '../lib/site'
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
        {groups.map((g) => (
          <div key={g.text.en} className="sidebar-group">
            <p className="sidebar-title">{g.text[locale]}</p>
            <ul>
              {g.items.map((it) => (
                <li key={it.href}>
                  <Link href={withLocale(locale, it.href)} className={pathname === it.href ? 'active' : ''} aria-current={pathname === it.href ? 'page' : undefined}>
                    {it.text[locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
    </>
  )
}

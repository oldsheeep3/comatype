'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { stripLocale, withLocale } from '../lib/i18n'
import { nav } from '../lib/site'
import { useLocale, useUi } from './useLocale'

export function NavLinks() {
  const pathname = stripLocale(usePathname() ?? '/')
  const locale = useLocale()
  const text = useUi()
  return (
    <nav className="nav-links" aria-label={text.mainNav}>
      {nav.map((n) => (
        <Link key={n.href} href={withLocale(locale, n.href)} className={n.match && pathname.startsWith(n.match) ? 'active' : ''}>
          {n.text[locale]}
        </Link>
      ))}
    </nav>
  )
}

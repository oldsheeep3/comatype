'use client'

import Link from 'next/link'
import { withLocale } from '../lib/i18n'
import { siteTitle } from '../lib/site'
import { LanguageSwitch } from './LanguageSwitch'
import { NavLinks } from './NavLinks'
import { SearchButton } from './Search'
import { MenuButton } from './Shell'
import { ThemeToggle } from './ThemeToggle'
import { useLocale } from './useLocale'

export function Header() {
  const locale = useLocale()
  return (
    <header className="site-header">
      <div className="header-inner">
        <MenuButton />
        <Link href={withLocale(locale, '/')} className="logo">
          {siteTitle}
        </Link>
        <NavLinks />
        <div className="header-actions">
          <SearchButton />
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

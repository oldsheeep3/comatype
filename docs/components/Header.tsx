'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { stripLocale, withLocale } from '../lib/i18n'
import { sidebarFor } from '../lib/site'
import { LanguageSwitch } from './LanguageSwitch'
import { Logo } from './Logo'
import { NavLinks } from './NavLinks'
import { SearchButton } from './Search'
import { MenuButton, NavButton } from './Shell'
import { SiteDrawer } from './SiteDrawer'
import { ThemeToggle } from './ThemeToggle'
import { useLocale } from './useLocale'

const github = 'https://github.com/oldsheeep3/comatype'

export function Header() {
  const locale = useLocale()
  const pathname = stripLocale(usePathname() ?? '/')
  // Docs pages have a sidebar, so their hamburger is on the left; the other pages get the site menu on the right
  const docs = !!sidebarFor(pathname)
  return (
    <header className={docs ? 'site-header docs' : 'site-header'}>
      <div className="header-inner">
        {docs && <MenuButton />}
        <Link href={withLocale(locale, '/')} className="logo">
          <Logo height={26} />
        </Link>
        <NavLinks />
        <div className="header-actions">
          <SearchButton />
          <LanguageSwitch />
          <ThemeToggle />
          <a href={github} className="icon-button github-link" aria-label="GitHub" target="_blank" rel="noreferrer noopener">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.5 7.5 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.8-3.7 4 .3.3.6.8.6 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z" />
            </svg>
            <span className="sr-only">GitHub</span>
          </a>
          {!docs && <NavButton />}
        </div>
      </div>
      {!docs && <SiteDrawer />}
    </header>
  )
}

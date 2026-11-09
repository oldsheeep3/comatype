'use client'

// Language switcher: goes to the same page in the other locale and remembers the choice,
// so that the automatic redirect for Japanese browsers does not fight a manual choice.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type Locale, localeName, locales, stripLocale, withLocale } from '../lib/i18n'
import { useLocale, useUi } from './useLocale'

export function LanguageSwitch() {
  const pathname = usePathname() ?? '/'
  const current = useLocale()
  const text = useUi()
  const rest = stripLocale(pathname)
  const remember = (l: Locale) => {
    try {
      localStorage.setItem('comatype-locale', l)
    } catch {
      /* storage may be unavailable; the switch still works for this visit */
    }
  }
  return (
    <div className="lang-switch" role="group" aria-label={text.language}>
      {locales.map((l) => (
        <Link
          key={l}
          href={withLocale(l, rest)}
          hrefLang={l === 'en' ? 'en' : 'ja'}
          lang={l === 'en' ? 'en' : 'ja'}
          className={l === current ? 'active' : ''}
          aria-current={l === current ? 'true' : undefined}
          onClick={() => remember(l)}
        >
          {localeName[l]}
        </Link>
      ))}
    </div>
  )
}

'use client'

import { usePathname } from 'next/navigation'
import { localeOf, ui, type Locale, type Ui } from '../lib/i18n'

/** The locale of the page being shown, derived from the URL (the `/ja-jp` prefix). */
export function useLocale(): Locale {
  return localeOf(usePathname() ?? '/')
}

/** UI strings of the current locale. */
export function useUi(): Ui {
  return ui[useLocale()]
}

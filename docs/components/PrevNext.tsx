import Link from 'next/link'
import { type Locale, ui, withLocale } from '../lib/i18n'
import { prevNext } from '../lib/site'

/** `pathname` is locale-free (`/guide/introduction/`). */
export function PrevNext({ pathname, locale }: { pathname: string; locale: Locale }) {
  const { prev, next } = prevNext(pathname)
  const text = ui[locale]
  if (!prev && !next) return null
  return (
    <nav className="prev-next" aria-label={`${text.prevPage} / ${text.nextPage}`}>
      {prev ? (
        <Link href={withLocale(locale, prev.href)} className="prev">
          <span>{text.prevPage}</span>
          {prev.text[locale]}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={withLocale(locale, next.href)} className="next">
          <span>{text.nextPage}</span>
          {next.text[locale]}
        </Link>
      )}
    </nav>
  )
}

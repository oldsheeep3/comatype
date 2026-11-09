import Link from 'next/link'
import { type Locale, ui, withLocale } from '../lib/i18n'

export function NotFoundPage({ locale }: { locale: Locale }) {
  const t = ui[locale]
  return (
    <div className="doc-layout no-sidebar">
      <main className="doc-main">
        <article className="doc">
          <h1>{t.notFound}</h1>
          <p>
            {t.notFoundBody} <Link href={withLocale(locale, '/')}>{t.backHome}</Link>
          </p>
        </article>
      </main>
    </div>
  )
}

// A Markdown page (server component), shared by the English and Japanese routes.
import { notFound } from 'next/navigation'
import { type Locale } from '../lib/i18n'
import { docExists, loadDoc } from '../lib/markdown'
import { sidebarFor } from '../lib/site'
import { PrevNext } from './PrevNext'
import { SidebarNav } from './SidebarNav'
import { Toc } from './Toc'

export async function DocPage({ locale, slug }: { locale: Locale; slug: string[] }) {
  if (!docExists(locale, slug)) notFound()
  const pathname = `/${slug.join('/')}/` // locale-free
  const doc = await loadDoc(locale, slug)
  const groups = sidebarFor(pathname)
  return (
    <div className="doc-layout">
      {groups && <SidebarNav groups={groups} />}
      <main className="doc-main">
        <article className="doc">{doc.content}</article>
        <PrevNext pathname={pathname} locale={locale} />
      </main>
      <Toc headings={doc.headings} />
    </div>
  )
}

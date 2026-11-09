// Markdown pages of the 'ja-jp' locale. The .md files in content/ja-jp/ become one HTML page each at build time (static export).
import type { Metadata } from 'next'
import { DocPage } from '../../../components/DocPage'
import { docExists, listSlugs, loadDoc } from '../../../lib/markdown'

export const dynamicParams = false

const locale = 'ja-jp' as const

export function generateStaticParams() {
  return listSlugs(locale).map((slug) => ({ slug }))
}

type Params = { params: Promise<{ slug: string[] }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  if (!docExists(locale, slug)) return {}
  const doc = await loadDoc(locale, slug)
  return { title: doc.title }
}

export default async function Page({ params }: Params) {
  const { slug } = await params
  return <DocPage locale={locale} slug={slug} />
}

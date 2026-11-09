// Builds the search index of a locale: one entry per section of every page.
import { type Locale, withLocale } from './i18n'
import { listSlugs, loadDoc } from './markdown'

export interface SearchEntry {
  id: string
  url: string
  page: string
  heading: string
  text: string
}

export async function searchIndex(locale: Locale): Promise<SearchEntry[]> {
  const entries: SearchEntry[] = []
  for (const slug of listSlugs(locale)) {
    const doc = await loadDoc(locale, slug)
    const base = withLocale(locale, `/${slug.join('/')}/`)
    for (const s of doc.sections) {
      if (!s.text && !s.heading) continue
      const url = s.id ? `${base}#${s.id}` : base
      entries.push({ id: url, url, page: doc.title, heading: s.heading, text: s.text })
    }
  }
  return entries
}

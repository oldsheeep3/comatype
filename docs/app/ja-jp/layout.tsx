import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { RootLayoutFor } from '../../components/RootLayout'
import { siteDescription, siteTitle } from '../../lib/site'

export const metadata: Metadata = {
  title: { default: siteTitle, template: `%s | ${siteTitle}` },
  description: siteDescription('ja-jp'),
}

export default function Layout({ children }: { children: ReactNode }) {
  return <RootLayoutFor locale="ja-jp">{children}</RootLayoutFor>
}

// The <html> shell shared by both locales (each locale has its own root layout so that <html lang> is right in the static HTML).
import type { ReactNode } from 'react'
import { htmlLang, redirectScript, type Locale, ui } from '../lib/i18n'
import { Header } from './Header'
import { ShellProvider } from './Shell'
import { themeScript } from './ThemeToggle'
import '../app/globals.css'

export function RootLayoutFor({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={htmlLang[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Japanese-language browsers on the English URL are sent to /ja-jp/ (a manual choice wins) */}
        {locale === 'en' && <script dangerouslySetInnerHTML={{ __html: redirectScript }} />}
      </head>
      <body>
        <ShellProvider>
          <Header />
          {children}
          <footer className="site-footer">{ui[locale].footer}</footer>
        </ShellProvider>
      </body>
    </html>
  )
}

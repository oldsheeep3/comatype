// The <html> shell shared by both locales (each locale has its own root layout so that <html lang> is right in the static HTML).
import type { ReactNode } from 'react'
import { htmlLang, type Locale, redirectScript } from '../lib/i18n'
import { Footer } from './Footer'
import { Header } from './Header'
import { ShellProvider } from './Shell'
import { themeScript } from './ThemeToggle'
import '../app/globals.css'

const fontScript = `(function(){var l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';document.head.appendChild(l)})()`

export function RootLayoutFor({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={htmlLang[locale]} suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/svg+xml" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/logo/logo-icon.svg`} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Web fonts load without blocking the first paint; the system fonts show until they arrive */}
        <script dangerouslySetInnerHTML={{ __html: fontScript }} />
        {/* Japanese-language browsers on the English URL are sent to /ja-jp/ (a manual choice wins) */}
        {locale === 'en' && <script dangerouslySetInnerHTML={{ __html: redirectScript }} />}
      </head>
      <body>
        <ShellProvider>
          <Header />
          {children}
          <Footer locale={locale} />
        </ShellProvider>
      </body>
    </html>
  )
}

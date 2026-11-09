// Site structure: navigation and sidebars. The page list is decided here (tests check that every linked Markdown file exists, in every locale).
// Hrefs are locale-free (`/guide/introduction/`); `withLocale` adds the `/ja-jp` prefix when rendering.

import { type Locale, ui, withLocale } from './i18n'

/** A text in every locale. */
export type L10n = Record<Locale, string>

export interface NavLink {
  text: L10n
  href: string
  /** The nav item is highlighted on pages whose path starts with this. */
  match?: string
}

export interface SidebarItem {
  text: L10n
  href: string
}

export interface SidebarGroup {
  text: L10n
  items: SidebarItem[]
}

export const siteTitle = 'Comatype'
export const siteDescription = (l: Locale): string => ui[l].siteDescription

const t = (en: string, ja: string): L10n => ({ en, 'ja-jp': ja })

export const nav: NavLink[] = [
  { text: t('Guide', 'ガイド'), href: '/guide/introduction/', match: '/guide/' },
  { text: t('.comat syntax', '.comat 記法'), href: '/language/endpoint/', match: '/language/' },
  { text: t('Runtimes', 'ランタイム'), href: '/runtime/typescript-client/', match: '/runtime/' },
  { text: t('Reference', 'リファレンス'), href: '/reference/cli/', match: '/reference/' },
  { text: t('Playground', 'Playground'), href: '/playground/', match: '/playground/' },
]

export const sidebars: Record<string, SidebarGroup[]> = {
  '/guide/': [
    {
      text: t('Getting started', 'はじめに'),
      items: [
        { text: t('What is Comatype?', 'Comatype とは'), href: '/guide/introduction/' },
        { text: t('Installation', 'インストール'), href: '/guide/installation/' },
        { text: t('Quick start', 'クイックスタート'), href: '/guide/getting-started/' },
        { text: t('Project layout', 'プロジェクトの構成'), href: '/guide/project-layout/' },
      ],
    },
    {
      text: t('Using Comatype', '使い方'),
      items: [
        { text: t('Workflow', '開発の流れ'), href: '/guide/workflow/' },
        { text: t('Generated code per language', '各言語の生成例'), href: '/guide/generated-code/' },
        { text: t('OpenAPI conversion', 'OpenAPI との変換'), href: '/guide/openapi/' },
        { text: t('Editor (VS Code)', 'エディタ（VS Code）'), href: '/guide/editor/' },
      ],
    },
  ],
  '/language/': [
    {
      text: t('.comat syntax', '.comat 記法'),
      items: [
        { text: t('Endpoints', 'エンドポイント'), href: '/language/endpoint/' },
        { text: t('How paths are decided', 'path の決め方'), href: '/language/paths/' },
        { text: t('Types', '型'), href: '/language/types/' },
        { text: t('Status codes', 'ステータスコード'), href: '/language/status-codes/' },
        { text: t('Headers and cookies', 'ヘッダと cookie'), href: '/language/headers-cookies/' },
        { text: t('Caching', 'キャッシュ'), href: '/language/cache/' },
        { text: t('init / defaults / wrappers', 'init / defaults / ラッパー'), href: '/language/init-defaults-wrappers/' },
      ],
    },
  ],
  '/runtime/': [
    {
      text: t('TypeScript', 'TypeScript'),
      items: [
        { text: t('Client c', 'クライアント c'), href: '/runtime/typescript-client/' },
        { text: t('Server s', 'サーバ s'), href: '/runtime/typescript-server/' },
      ],
    },
    {
      text: t('Other languages', 'その他の言語'),
      items: [
        { text: t('JavaScript', 'JavaScript'), href: '/runtime/javascript/' },
        { text: t('Go', 'Go'), href: '/runtime/go/' },
        { text: t('Python', 'Python'), href: '/runtime/python/' },
        { text: t('Rust', 'Rust'), href: '/runtime/rust/' },
        { text: t('Java', 'Java'), href: '/runtime/java/' },
        { text: t('Kotlin', 'Kotlin'), href: '/runtime/kotlin/' },
        { text: t('Swift', 'Swift'), href: '/runtime/swift/' },
        { text: t('Ruby', 'Ruby'), href: '/runtime/ruby/' },
        { text: t('C#', 'C#'), href: '/runtime/csharp/' },
      ],
    },
    { text: t('Common', '共通'), items: [{ text: t('Wrappers and cookies', 'ラッパーと cookie'), href: '/runtime/wrappers-cookies/' }] },
  ],
  '/reference/': [
    {
      text: t('Reference', 'リファレンス'),
      items: [
        { text: t('CLI (comatype)', 'CLI（comatype）'), href: '/reference/cli/' },
        { text: t('Configuration file', '設定ファイル'), href: '/reference/config/' },
        { text: t('Names of generated code', '生成されるコードの名前'), href: '/reference/generated-names/' },
        { text: t('Validation and errors', 'バリデーションとエラー'), href: '/reference/validation/' },
        { text: t('Status code list', 'ステータスコード一覧'), href: '/reference/status-codes/' },
      ],
    },
  ],
}

/** The sidebar for a pathname such as `/guide/introduction/` (locale-free). */
export function sidebarFor(pathname: string): SidebarGroup[] | undefined {
  const key = Object.keys(sidebars).find((k) => pathname.startsWith(k))
  return key ? sidebars[key] : undefined
}

/** Previous / next pages within the same sidebar (locale-free pathname). */
export function prevNext(pathname: string): { prev?: SidebarItem; next?: SidebarItem } {
  const groups = sidebarFor(pathname)
  if (!groups) return {}
  const flat = groups.flatMap((g) => g.items)
  const i = flat.findIndex((it) => it.href === pathname)
  if (i < 0) return {}
  return { prev: flat[i - 1], next: flat[i + 1] }
}

/** Every page listed in a sidebar (`/guide/introduction/` form). */
export function allDocHrefs(): string[] {
  return Object.values(sidebars).flatMap((groups) => groups.flatMap((g) => g.items.map((i) => i.href)))
}

export { withLocale }

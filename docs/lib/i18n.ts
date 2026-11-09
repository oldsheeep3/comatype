// Locales of the site. English is the default and lives at `/`; Japanese lives at `/ja-jp/`.

export const locales = ['en', 'ja-jp'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

/** URL prefix of a locale (`''` for the default locale). */
export const localePrefix = (l: Locale): string => (l === 'en' ? '' : '/ja-jp')

/** `/guide/x/` -> `/ja-jp/guide/x/` for Japanese, unchanged for English. */
export const withLocale = (l: Locale, p: string): string => `${localePrefix(l)}${p}`

/** The locale a pathname (without the base path) belongs to. */
export function localeOf(pathname: string): Locale {
  return pathname === '/ja-jp' || pathname.startsWith('/ja-jp/') ? 'ja-jp' : 'en'
}

/** Removes the locale prefix: `/ja-jp/guide/x/` -> `/guide/x/`. */
export function stripLocale(pathname: string): string {
  const rest = pathname.replace(/^\/ja-jp(?=\/|$)/, '')
  return rest === '' ? '/' : rest
}

export const htmlLang: Record<Locale, string> = { en: 'en', 'ja-jp': 'ja' }
export const localeName: Record<Locale, string> = { en: 'English', 'ja-jp': '日本語' }

/** Strings of the UI chrome (everything that is not Markdown content). */
export interface Ui {
  siteDescription: string
  menu: string
  mainNav: string
  pageList: string
  onThisPage: string
  prevPage: string
  nextPage: string
  copy: string
  copied: string
  copyCode: string
  search: string
  searchPlaceholder: string
  searchLoading: string
  searchFailed: string
  searchEmpty: string
  light: string
  dark: string
  language: string
  footer: string
  close: string
  footerTagline: string
  footerDocs: string
  footerLanguages: string
  footerProject: string
  backToTop: string
  dartPlanned: string
  notFound: string
  notFoundBody: string
  backHome: string
  statusFilterPlaceholder: string
  statusFilterLabel: string
  statusCode: string
  statusMessage: string
  statusBody: string
  statusDefault: string
  statusCanHaveBody: string
  statusNoBody: string
  statusNone: string
  editorFailed: string
}

export const ui: Record<Locale, Ui> = {
  en: {
    siteDescription: 'Write your API types once in .comat; generate types, validation, clients and servers for every language.',
    menu: 'Menu',
    mainNav: 'Main navigation',
    pageList: 'Pages',
    onThisPage: 'On this page',
    prevPage: 'Previous',
    nextPage: 'Next',
    copy: 'Copy',
    copied: 'Copied',
    copyCode: 'Copy code',
    search: 'Search',
    searchPlaceholder: 'Search the docs',
    searchLoading: 'Loading…',
    searchFailed: 'Could not load the search index',
    searchEmpty: 'No results',
    light: 'Switch to light mode',
    dark: 'Switch to dark mode',
    language: 'Language',
    footer: 'MIT License · © Comatype contributors',
    close: 'Close',
    footerTagline: 'Write an API once. Get types, validation, clients and servers.',
    footerDocs: 'Docs',
    footerLanguages: 'Languages',
    footerProject: 'Project',
    backToTop: 'Back to top ↑',
    dartPlanned: 'Dart is planned.',
    notFound: 'Page not found',
    notFoundBody: 'The page you are looking for does not exist.',
    backHome: 'Back to the home page',
    statusFilterPlaceholder: 'Filter by code or message (e.g. 404, Not Found)',
    statusFilterLabel: 'Filter status codes',
    statusCode: 'Code',
    statusMessage: 'Message',
    statusBody: 'Body',
    statusDefault: 'Default when omitted',
    statusCanHaveBody: 'allowed',
    statusNoBody: 'not allowed',
    statusNone: 'No matching codes',
    editorFailed: '(the editor could not be loaded)',
  },
  'ja-jp': {
    siteDescription: '.comat で API の型を 1 回だけ書いて、各言語の型・検証・クライアント・サーバを生成する',
    menu: 'メニュー',
    mainNav: 'メインのナビゲーション',
    pageList: 'ページの一覧',
    onThisPage: 'このページの内容',
    prevPage: '前のページ',
    nextPage: '次のページ',
    copy: 'コピー',
    copied: 'コピーしました',
    copyCode: 'コードをコピー',
    search: '検索',
    searchPlaceholder: 'ドキュメントを検索',
    searchLoading: '読み込み中…',
    searchFailed: '検索の索引を読み込めませんでした',
    searchEmpty: '一致するものはありません',
    light: 'ライトモードにする',
    dark: 'ダークモードにする',
    language: '言語',
    footer: 'MIT License · © Comatype contributors',
    close: '閉じる',
    footerTagline: 'API を 1 回だけ書いて、型・検証・クライアント・サーバを手に入れる。',
    footerDocs: 'ドキュメント',
    footerLanguages: '対応言語',
    footerProject: 'プロジェクト',
    backToTop: 'ページの先頭へ ↑',
    dartPlanned: 'Dart は予定しています。',
    notFound: 'ページが見つかりません',
    notFoundBody: '探しているページは、ありません。',
    backHome: 'トップへ戻る',
    statusFilterPlaceholder: 'コードやメッセージで絞り込む（例: 404, Not Found）',
    statusFilterLabel: 'ステータスコードの絞り込み',
    statusCode: 'コード',
    statusMessage: 'メッセージ',
    statusBody: '本文',
    statusDefault: '省略したときの既定',
    statusCanHaveBody: '持てる',
    statusNoBody: '持てない',
    statusNone: '一致するコードはありません',
    editorFailed: '（エディタを読み込めませんでした）',
  },
}

/**
 * Inline script (runs before first paint) that sends Japanese-language browsers from the English URL to the
 * `/ja-jp/` equivalent. A manual choice (stored by the language switcher) always wins, and Japanese pages never redirect back.
 */
export const redirectScript = `(function(){try{
var base=${JSON.stringify(process.env.NEXT_PUBLIC_BASE_PATH ?? '')};
var p=location.pathname;if(base&&p.indexOf(base)===0)p=p.slice(base.length)||'/';
if(p==='/ja-jp'||p.indexOf('/ja-jp/')===0)return;
if(p==='/search.json'||p.indexOf('/_next')===0)return;
var saved=null;try{saved=localStorage.getItem('comatype-locale')}catch(e){}
if(saved==='en')return;
var langs=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'']);
var ja=saved==='ja-jp'||String(langs[0]||'').toLowerCase().indexOf('ja')===0;
if(ja)location.replace(base+'/ja-jp'+(p==='/'?'/':p)+location.search+location.hash);
}catch(e){}})();`

// Content of the landing page (LP), in every locale.

import type { Locale } from './i18n'

export interface HomeContent {
  eyebrow: string
  title: string
  tagline: string
  start: string
  playground: string
  reference: string
  installLabel: string
  languagesLabel: string
  exampleTitle: string
  exampleLead: string
  tabComat: string
  tabClient: string
  tabServer: string
  featuresTitle: string
  features: { icon: string; title: string; body: string }[]
  stepsTitle: string
  steps: { title: string; body: string; code: string }[]
  matrixTitle: string
  matrixLead: string
  matrixHead: string[]
  matrixNote: string
  toolsTitle: string
  toolsLead: string
  tools: { cmd: string; body: string }[]
  terminalTitle: string
  ctaTitle: string
  ctaBody: string
}

export const languages = ['TypeScript', 'Go', 'Python', 'Rust', 'Java', 'Kotlin', 'Swift', 'Ruby'] as const

/** Runtime facts per language: [language, client / server, runtime dependency in English, in Japanese]. */
export const matrix: { lang: string; deps: Record<Locale, string>; registry: { name: string; url: string } }[] = [
  {
    lang: 'TypeScript',
    deps: { en: 'Fetch API (Node, Bun, Deno, Workers)', 'ja-jp': 'Fetch API（Node・Bun・Deno・Workers）' },
    registry: { name: 'npm', url: 'https://www.npmjs.com/package/@comatype/typescript' },
  },
  {
    lang: 'Go',
    deps: { en: 'Standard library only', 'ja-jp': '標準ライブラリのみ' },
    registry: { name: 'pkg.go.dev', url: 'https://pkg.go.dev/github.com/oldsheeep3/comatype/packages/go' },
  },
  {
    lang: 'Python',
    deps: { en: 'pydantic v2 + httpx (ASGI server)', 'ja-jp': 'pydantic v2 + httpx（ASGI のサーバ）' },
    registry: { name: 'PyPI', url: 'https://pypi.org/project/comatype/' },
  },
  {
    lang: 'Rust',
    deps: { en: 'serde + ureq + regex', 'ja-jp': 'serde + ureq + regex' },
    registry: { name: 'crates.io', url: 'https://crates.io/crates/comatype' },
  },
  {
    lang: 'Java',
    deps: { en: 'No dependencies (JDK 21+)', 'ja-jp': '依存なし（JDK 21 以上）' },
    registry: { name: 'Maven Central', url: 'https://central.sonatype.com/artifact/net.sheeplab.comatype/comatype' },
  },
  {
    lang: 'Kotlin',
    deps: { en: 'Coroutines (suspend), no extra libraries', 'ja-jp': 'コルーチン（suspend）。追加ライブラリなし' },
    registry: { name: 'Maven Central', url: 'https://central.sonatype.com/artifact/net.sheeplab.comatype/comatype-ktx' },
  },
  {
    lang: 'Swift',
    deps: { en: 'Foundation only (async/await)', 'ja-jp': 'Foundation のみ（async/await）' },
    registry: { name: 'GitHub', url: 'https://github.com/oldsheeep3/comatype/tree/main/packages/swift' },
  },
  {
    lang: 'Ruby',
    deps: { en: 'Standard library only (Rack compatible)', 'ja-jp': '標準ライブラリのみ（Rack 互換）' },
    registry: { name: 'RubyGems', url: 'https://rubygems.org/gems/comatype' },
  },
]

export const home: Record<Locale, HomeContent> = {
  en: {
    eyebrow: 'Schema-first API toolkit',
    title: 'Write your API types once.',
    tagline:
      'Describe endpoints, types, status codes and headers in a .comat file. Comatype generates typed, validated clients and servers for TypeScript, Go, Python, Rust, Java, Kotlin, Swift and Ruby.',
    start: 'Get started',
    playground: 'Try the Playground',
    reference: 'Reference',
    installLabel: 'Build the CLI',
    languagesLabel: 'One definition, eight languages',
    exampleTitle: 'One definition. Client and server.',
    exampleLead: 'The same .comat file produces the request and response types on both sides of the wire.',
    tabComat: 'user/put_[id].comat',
    tabClient: 'Client (TypeScript)',
    tabServer: 'Server (TypeScript)',
    featuresTitle: 'Everything between your client and your server',
    features: [
      {
        icon: '◇',
        title: 'A single source of truth',
        body: 'Endpoints, types, status codes, headers and cookies live in .comat files. Clients and servers are generated from the same definition, so they cannot drift apart.',
      },
      {
        icon: '✓',
        title: 'Validated both ways',
        body: 'Requests are validated before they are sent and responses after they arrive, with the same schema. Per-status response types reach the caller.',
      },
      {
        icon: '⚙',
        title: 'Thin runtimes',
        body: 'The client (c) and server (s) are small libraries. Wrappers, cookies and header conversion are handled for you; most runtimes use only the standard library.',
      },
      {
        icon: '⌥',
        title: 'Wrappers & ctx',
        body: 'Declare wrappers such as auth once. Handlers receive a typed ctx, and the compiler tells you when a wrapper is missing.',
      },
      {
        icon: '⚡',
        title: 'Built-in caching',
        body: 'Add `cache 5000` to a GET or QUERY endpoint to cache responses in memory on both client and server, or in a cookie on the client.',
      },
      {
        icon: '↯',
        title: 'Language server',
        body: 'Syntax errors, unresolved types and invalid status codes are reported before you save, with go-to-definition, hover and completion.',
      },
      {
        icon: '⇄',
        title: 'OpenAPI both ways',
        body: 'Export OpenAPI 3 from .comat, or import an OpenAPI file and generate code in one command.',
      },
      {
        icon: '#',
        title: 'A fixed status-code registry',
        body: 'Only registered standard codes (plus the ones you add in config) are allowed, and bodies default to { message }.',
      },
    ],
    stepsTitle: 'How it works',
    steps: [
      {
        title: 'Write',
        body: 'Describe an endpoint. Its path comes from where the file lives.',
        code: 'todo/[id]/get.comat\n\nparams { id: uuidv4 }\n\ns200 Todo\ns404',
      },
      { title: 'Generate', body: 'Run the CLI for the languages and roles you configured.', code: '$ comat generate\n生成: 36 files' },
      {
        title: 'Use',
        body: 'Call the typed client, or implement the typed handler.',
        code: 'const res = await c.get(getTodo, { params: { id } }, ok, notFound)\nif (res.status === 200) res.data.title',
      },
    ],
    matrixTitle: 'Eight languages, client and server',
    matrixLead:
      'Every language has a generator, a runtime and an end-to-end test that connects the generated client to the generated server.',
    matrixHead: ['Language', 'Client', 'Server', 'Runtime', 'Package'],
    matrixNote: 'Dart is planned.',
    toolsTitle: 'A CLI that catches mistakes',
    toolsLead:
      'Check your setup by topic, list every endpoint colored by the wrappers that apply, and migrate file names to the recommended layout.',
    tools: [
      { cmd: 'comat check cache', body: 'Show only the diagnostics of one topic: cache, path, wrap, cookie, status, import or type.' },
      {
        cmd: 'comat endpoints -g',
        body: 'List endpoints grouped by the exact wrapper chain (order included), with paths colored per wrapper.',
      },
      {
        cmd: 'comat format comatfiles --fix',
        body: 'Rewrite deprecated file names to the recommended [id]/get.comat layout and fix imports.',
      },
    ],
    terminalTitle: 'comat endpoints -g',
    ctaTitle: 'Stop writing the same types twice.',
    ctaBody: 'Read the quick start, or open the Playground and write your first endpoint.',
  },
  'ja-jp': {
    eyebrow: 'スキーマファーストの API ツールキット',
    title: 'API の型を、1 回だけ書く。',
    tagline:
      'エンドポイント・型・ステータスコード・ヘッダを .comat に書くだけ。TypeScript・Go・Python・Rust・Java・Kotlin・Swift・Ruby の、型付きで検証つきのクライアントとサーバを生成します。',
    start: 'はじめる',
    playground: 'Playground を試す',
    reference: 'リファレンス',
    installLabel: 'CLI をビルドする',
    languagesLabel: '1 つの定義から、8 つの言語へ',
    exampleTitle: '1 つの定義から、クライアントもサーバも',
    exampleLead: '同じ .comat から、通信の両側のリクエスト・レスポンスの型ができます。',
    tabComat: 'user/put_[id].comat',
    tabClient: 'クライアント（TypeScript）',
    tabServer: 'サーバ（TypeScript）',
    featuresTitle: 'クライアントとサーバの間にあるもの、全部',
    features: [
      {
        icon: '◇',
        title: '1 か所に書く',
        body: 'エンドポイント・型・ステータス・ヘッダ・cookie を .comat に書くだけ。クライアントとサーバが同じ定義から生成されるので、ずれません。',
      },
      {
        icon: '✓',
        title: '双方向で検証',
        body: '送る前と受け取った後に、同じスキーマで検証します。ステータスごとのレスポンスの型も、呼び出し側に伝わります。',
      },
      {
        icon: '⚙',
        title: '薄いランタイム',
        body: 'c（クライアント）と s（サーバ）は小さなライブラリ。ラッパー、cookie、ヘッダの変換まで面倒を見ます。ほとんどの言語で標準ライブラリだけです。',
      },
      {
        icon: '⌥',
        title: 'ラッパーと ctx',
        body: 'auth などのラッパーを 1 回宣言すれば、ハンドラは型付きの ctx を受け取れます。ラッパーの不足は、コンパイル時に分かります。',
      },
      {
        icon: '⚡',
        title: 'キャッシュ組み込み',
        body: 'GET / QUERY に `cache 5000` と書くだけで、クライアントもサーバもメモリにキャッシュします。クライアントは cookie にも。',
      },
      {
        icon: '↯',
        title: '言語サーバ',
        body: '構文エラー・型の解決・ステータスコードの誤りを保存前に知らせます。定義ジャンプ、ホバー、補完も。',
      },
      {
        icon: '⇄',
        title: 'OpenAPI と相互変換',
        body: '.comat から OpenAPI 3 を書き出し、OpenAPI から .comat を作ってコードまで生成できます。',
      },
      {
        icon: '#',
        title: '決まったステータスコードだけ',
        body: '登録された標準のコードと、設定で足したコードだけを使えます。本文の既定は { message } です。',
      },
    ],
    stepsTitle: '使い方',
    steps: [
      {
        title: '書く',
        body: 'エンドポイントを書きます。path は、ファイルの置き場所から決まります。',
        code: 'todo/[id]/get.comat\n\nparams { id: uuidv4 }\n\ns200 Todo\ns404',
      },
      { title: '生成する', body: '設定した言語と役割のコードを、CLI で生成します。', code: '$ comat generate\n生成: 36 ファイル' },
      {
        title: '使う',
        body: '型付きのクライアントを呼ぶか、型付きのハンドラを実装します。',
        code: 'const res = await c.get(getTodo, { params: { id } }, ok, notFound)\nif (res.status === 200) res.data.title',
      },
    ],
    matrixTitle: '8 つの言語、クライアントもサーバも',
    matrixLead: 'どの言語にも、生成器とランタイムと、生成したクライアントを生成したサーバに繋ぐ E2E テストがあります。',
    matrixHead: ['言語', 'クライアント', 'サーバ', 'ランタイム', 'パッケージ'],
    matrixNote: 'Dart は予定です。',
    toolsTitle: 'ミスを見つける CLI',
    toolsLead: '設定を分野ごとに検査し、効いているラッパーで色分けしてエンドポイントを一覧し、ファイル名を推奨の形に直せます。',
    tools: [
      { cmd: 'comat check cache', body: '1 つの分野（cache / path / wrap / cookie / status / import / type）の診断だけを出します。' },
      { cmd: 'comat endpoints -g', body: 'ラッパーの組（順番も含めて完全一致）ごとに区切って、path を色分けして一覧します。' },
      { cmd: 'comat format comatfiles --fix', body: '非推奨のファイル名を、推奨の [id]/get.comat の形に直し、import も書き換えます。' },
    ],
    terminalTitle: 'comat endpoints -g',
    ctaTitle: '同じ型を、2 度書くのはやめよう。',
    ctaBody: 'クイックスタートを読むか、Playground で最初のエンドポイントを書いてみてください。',
  },
}

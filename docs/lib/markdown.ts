// Build-time Markdown -> React pipeline (runs in server components).
//   - `<<< @/path#region [title]` pulls in a file (such as the real files of usage/) as a code block
//   - `::: tip` / `::: warning` / `::: code-group` containers
//   - Code highlighting uses shiki. `.comat` uses the same TextMate grammar as the VS Code extension
//   - Places where React components such as `<StatusTable />` are inserted
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import GithubSlugger from 'github-slugger'
import type { Element, Root as HastRoot } from 'hast'
import type { Code, Parent as MdastParent, Root as MdastRoot } from 'mdast'
import { toString as mdastToString } from 'mdast-util-to-string'
import type { ReactNode } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import rehypeReact from 'rehype-react'
import rehypeSlug from 'rehype-slug'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import type { BundledLanguage } from 'shiki'
import { createHighlighter } from 'shiki'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import comatGrammar from '../../editors/vscode/syntaxes/comat.tmLanguage.json'
import { mdComponents } from '../components/md'
import { type Locale, withLocale } from './i18n'

/** docs/ (the `@` of `<<< @/…` points here) */
export const docsRoot = process.cwd()
export const contentRoot = path.join(docsRoot, 'content')

/** Directory of a locale's pages: `content/en` or `content/ja-jp`. */
export const localeRoot = (locale: Locale): string => path.join(contentRoot, locale)

// ---- List of pages ----

export function listSlugs(locale: Locale, dir = localeRoot(locale), prefix: string[] = []): string[][] {
  const out: string[][] = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listSlugs(locale, p, [...prefix, name]))
    else if (name.endsWith('.md')) out.push([...prefix, name.replace(/\.md$/, '')])
  }
  return out
}

export function docFile(locale: Locale, slug: string[]): string {
  return path.join(localeRoot(locale), ...slug) + '.md'
}

export function docExists(locale: Locale, slug: string[]): boolean {
  return existsSync(docFile(locale, slug))
}

// ---- Preprocessing (turn VitePress-style container syntax into remark-directive syntax) ----

/** `::: tip heading` -> `:::tip[heading]`, `::: code-group` -> `:::code-group`. Code blocks are left untouched */
function normalizeContainers(md: string): string {
  let fence = false
  return md
    .split('\n')
    .map((line) => {
      if (/^```/.test(line)) fence = !fence
      if (fence) return line
      const m = /^:::\s*([a-z-]+)\s*(.*)$/.exec(line)
      if (!m) return line
      return m[2] ? `:::${m[1]}[${m[2].trim()}]` : `:::${m[1]}`
    })
    .join('\n')
}

// ---- remark plugins ----

const EXT_LANG: Record<string, string> = {
  comat: 'comat',
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  go: 'go',
  py: 'python',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  md: 'md',
  rs: 'rust',
  java: 'java',
  rb: 'ruby',
  kt: 'kotlin',
  swift: 'swift',
  cs: 'csharp',
}

/** From `// #region name` to `// #endregion name` (the heading lines are not included) */
function extractRegion(text: string, name: string, file: string): string {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => new RegExp(`#region\\s+${name}\\s*$`).test(l))
  const end = lines.findIndex((l, i) => i > start && new RegExp(`#endregion\\s+${name}\\s*$`).test(l))
  if (start < 0 || end < 0) throw new Error(`${file}: #region ${name} がありません`)
  return lines.slice(start + 1, end).join('\n')
}

/** Turn `<<< @/path#region{lines} [title]` into a code block containing that file */
function remarkInclude() {
  return (tree: MdastRoot) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!parent || index === undefined || node.children.length === 0) return
      const text = mdastToString(node).trim()
      const m = /^<<<\s+(\S+?)(?:\s+\[(.+)\])?$/.exec(text)
      if (!m) return
      const [, spec, title] = m
      const [rel, region] = spec.replace(/\{[^}]*\}$/, '').split('#')
      const file = path.join(docsRoot, rel.replace(/^@\//, ''))
      if (!existsSync(file)) throw new Error(`<<< で引いているファイルがありません: ${rel}`)
      let value = readFileSync(file, 'utf8')
      if (region) value = extractRegion(value, region, rel)
      const ext = path.extname(file).slice(1)
      const code: Code = { type: 'code', lang: EXT_LANG[ext] ?? 'text', meta: title ? `[${title}]` : null, value: value.replace(/\n$/, '') }
      ;(parent as MdastParent).children[index] = code
    })
  }
}

const CALLOUT_TITLE: Record<Locale, Record<string, string>> = {
  en: { tip: 'Tip', info: 'Info', warning: 'Warning', danger: 'Danger', details: 'Details' },
  'ja-jp': { tip: 'ヒント', info: '情報', warning: '注意', danger: '警告', details: '詳細' },
}

/** The locale a document is rendered for (passed through `file.data`). */
const localeOfFile = (file: { data: Record<string, unknown> }): Locale => (file.data.locale === 'ja-jp' ? 'ja-jp' : 'en')

/** Prefixes site-internal links (`/guide/x/`) with `/ja-jp` when rendering Japanese pages. */
function remarkLocaleLinks() {
  return (tree: MdastRoot, file: { data: Record<string, unknown> }) => {
    const locale = localeOfFile(file)
    if (locale === 'en') return
    visit(tree, 'link', (node) => {
      if (node.url.startsWith('/') && !node.url.startsWith('//') && !node.url.startsWith('/ja-jp')) node.url = withLocale(locale, node.url)
    })
  }
}

/** Containers such as `:::tip` -> div. `:::code-group` -> <code-group>. Other directives (`:name`) are turned back into the original text */
function remarkContainers() {
  return (tree: MdastRoot, file: { data: Record<string, unknown> }) => {
    const titles = CALLOUT_TITLE[localeOfFile(file)]
    visit(tree, (node, index, parent) => {
      const n = node as unknown as {
        type: string
        name?: string
        children: unknown[]
        data?: Record<string, unknown>
        attributes?: Record<string, string>
      }
      if (n.type === 'textDirective' || n.type === 'leafDirective') {
        if (!parent || index === undefined) return
        const label = n.children.length ? `[${mdastToString(n as never)}]` : ''
        ;(parent as MdastParent).children[index] = { type: 'text', value: `${n.type === 'leafDirective' ? '::' : ':'}${n.name}${label}` }
        return
      }
      if (n.type !== 'containerDirective') return
      const name = n.name ?? ''
      if (name === 'code-group') {
        n.data = { hName: 'code-group' }
        return
      }
      const known = name in titles
      n.data = { hName: 'div', hProperties: { className: known ? ['callout', `callout-${name}`] : ['callout'] } }
      let title = titles[name] ?? name
      const first = n.children[0] as { type: string; data?: { directiveLabel?: boolean }; children?: unknown[] } | undefined
      if (first?.data?.directiveLabel) {
        title = mdastToString(first as never)
        n.children.shift()
      }
      n.children.unshift({
        type: 'paragraph',
        data: { hName: 'p', hProperties: { className: ['callout-title'] } },
        children: [{ type: 'text', value: title }],
      })
    })
  }
}

/** Turn `<StatusTable />` (HTML) written in the body into a place to insert a React component */
function remarkComponents() {
  return (tree: MdastRoot) => {
    visit(tree, 'html', (node) => {
      const m = /^<([A-Z][A-Za-z]*)\s*\/>$/.exec(node.value.trim())
      if (!m) return
      const n = node as unknown as { type: string; data?: Record<string, unknown> }
      n.type = 'paragraph'
      n.data = { hName: `x-${m[1].toLowerCase()}` }
      ;(n as unknown as { children: unknown[] }).children = []
    })
  }
}

// ---- rehype plugins ----

/** Extract the code block meta (`[title]` or `title="..."`) as the title */
function metaTitle(meta: string | undefined): string | undefined {
  if (!meta) return undefined
  return /\[(.+)\]/.exec(meta)?.[1] ?? /title="([^"]+)"/.exec(meta)?.[1]
}

/** Give `<code-group>` the titles of the code blocks inside it (the tab headings) */
function rehypeCodeGroup() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'code-group') return
      // shiki sometimes returns pre wrapped in a root, so unwrap it
      node.children = node.children.flatMap((c) =>
        (c as { type: string }).type === 'root' ? (c as unknown as { children: Element['children'] }).children : [c],
      )
      const titles = node.children
        .filter((c): c is Element => c.type === 'element' && c.tagName === 'pre')
        .map((pre, i) =>
          String(
            pre.properties?.['data-title'] ??
              pre.properties?.['dataTitle'] ??
              pre.properties?.['data-lang'] ??
              pre.properties?.['dataLang'] ??
              `${i + 1}`,
          ),
        )
      node.properties = { ...node.properties, dataTitles: JSON.stringify(titles) }
      node.children = node.children.filter((c) => c.type === 'element')
    })
  }
}

// ---- Processor ----

const LANGS = [
  { ...(comatGrammar as object), name: 'comat', aliases: ['comatype'] },
  'ts',
  'tsx',
  'js',
  'go',
  'python',
  'json',
  'yaml',
  'toml',
  'bash',
  'rust',
  'markdown',
  'java',
  'kotlin',
  'swift',
  'ruby',
  'csharp',
] as unknown as BundledLanguage[]

let processorPromise: Promise<ReturnType<typeof buildProcessor>> | undefined

async function buildProcessor() {
  const highlighter = await createHighlighter({ themes: ['github-light', 'github-dark'], langs: LANGS })
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkLocaleLinks)
    .use(remarkInclude)
    .use(remarkContainers)
    .use(remarkComponents)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeShikiFromHighlighter, highlighter, {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
      fallbackLanguage: 'text',
      transformers: [
        {
          name: 'comatype-meta',
          pre(this: any, node: any) {
            const raw = (this.options.meta as { __raw?: string } | undefined)?.__raw
            const title = metaTitle(raw)
            if (title) node.properties['data-title'] = title
            node.properties['data-lang'] = this.options.lang
          },
        },
      ],
    })
    .use(rehypeCodeGroup)
    .use(rehypeReact, { Fragment, jsx, jsxs, components: mdComponents })
}

export interface Heading {
  depth: number
  text: string
  id: string
}

export interface RenderedDoc {
  title: string
  headings: Heading[]
  content: ReactNode
  /** For search: the body of each heading (code excluded) */
  sections: { id: string; heading: string; text: string }[]
}

/** Turn a Markdown string into React elements */
export async function renderMarkdown(md: string, locale: Locale = 'en'): Promise<RenderedDoc> {
  const source = normalizeContainers(md)
  processorPromise ??= buildProcessor()
  const processor = await processorPromise
  const file = await processor.process({ value: source, data: { locale } })

  // Headings (table of contents and search). IDs use github-slugger, same as rehype-slug
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).parse(source) as MdastRoot
  const slugger = new GithubSlugger()
  const headings: Heading[] = []
  const sections: RenderedDoc['sections'] = []
  let title = ''
  let current: { id: string; heading: string; text: string[] } | undefined
  const flush = () => {
    if (current) sections.push({ id: current.id, heading: current.heading, text: current.text.join(' ').replace(/\s+/g, ' ').trim() })
  }
  for (const child of tree.children) {
    if (child.type === 'heading') {
      const text = mdastToString(child)
      const id = slugger.slug(text)
      if (child.depth === 1 && !title) title = text
      if (child.depth === 2 || child.depth === 3) headings.push({ depth: child.depth, text, id })
      flush()
      current = { id: child.depth === 1 ? '' : id, heading: text, text: [] }
    } else if (child.type !== 'code' && current) {
      current.text.push(mdastToString(child as never))
    } else if (child.type !== 'code' && !current) {
      current = { id: '', heading: '', text: [mdastToString(child as never)] }
    }
  }
  flush()
  return { title, headings, content: file.result as ReactNode, sections }
}

export async function loadDoc(locale: Locale, slug: string[]): Promise<RenderedDoc> {
  return renderMarkdown(readFileSync(docFile(locale, slug), 'utf8'), locale)
}

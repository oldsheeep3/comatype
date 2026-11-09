# Website design brief

For redesigning the Comatype website (https://comatype.sheeplab.net) with Claude Design. The structure and content are fixed; the look is open.

## What the site is

Comatype turns API definitions written once in `.comat` files into types, validation, clients and servers for ten languages. The site is the landing page plus the reference (syntax, runtimes, CLI). Readers are backend and full-stack developers who are deciding whether to adopt it, then looking things up while they work.

Tone: precise, calm, technical. Code is the hero; avoid stock illustrations and marketing noise.

## Pages

| Route | Page | Source |
|---|---|---|
| `/`, `/ja-jp/` | Landing page: hero, a `.comat` → client → server example (tabbed), the language matrix, the `comatype endpoints -g` terminal sample, links into the docs | `docs/components/Home.tsx`, text in `docs/lib/home-content.ts` |
| `/guide/…`, `/language/…`, `/runtime/…`, `/reference/…` | Documentation pages (Markdown) with a sidebar, an in-page table of contents, previous / next links | `docs/content/{en,ja-jp}/…`, layout in `docs/components/Shell.tsx`, `DocPage.tsx` |
| `/playground/` | Monaco editor for `.comat` with live diagnostics | `docs/components/Playground.tsx` |
| 404 | Not found | `docs/components/NotFoundPage.tsx` |

Both locales (English at `/`, Japanese at `/ja-jp/`) share every layout. Japanese text is longer and has no word spaces: leave room, and set `lang`-aware fonts.

## Parts to design

Header with logo, top nav, search, language switch and theme toggle · sidebar · table of contents · prose (headings with anchors, tables, callouts `tip / info / warning / danger`) · code blocks with titles, copy button and tabs (`code-group`) · status-code table · terminal sample · language matrix · footer (none yet).

## Constraints

- Static export (Next.js 16 App Router, React 19). No server runtime, no client-side data fetching beyond `search.json`.
- Both light and dark themes; `prefers-color-scheme` plus an explicit toggle (`data-theme`).
- Colors and sizes are CSS custom properties in `docs/app/globals.css` (`--bg`, `--bg-soft`, `--bg-code`, `--text`, `--border`, `--brand`, `--brand-soft`, `--danger`, `--success`, `--header-h`, `--font`, `--mono`). Change the values there rather than hard-coding colors.
- Code highlighting is Shiki (`github-light` / `github-dark`); a different pair can be set in `docs/lib/markdown.ts`.
- Responsive down to a 375px phone; no horizontal page scroll; tables scroll inside their own wrapper.
- Keep it fast: no web-font dependency that blocks rendering, no large images.
- Accessible: 4.5:1 text contrast, visible focus, reduced-motion respected.

## Where to work

```bash
pnpm install
pnpm --dir docs dev          # http://localhost:5173
pnpm --dir docs check        # typecheck, build, tests
```

Change CSS and the components named above. Do not edit `docs/content/**` for design reasons, and keep every visible string in `docs/lib/i18n.ts` or `docs/lib/home-content.ts` (both locales).

// The Playground page, shared by both locales.

import { type Locale, withLocale } from '../lib/i18n'
import { Playground } from './Playground'

export function PlaygroundPage({ locale }: { locale: Locale }) {
  const editor = withLocale(locale, '/guide/editor/')
  return (
    <div className="doc-layout no-sidebar">
      <main className="doc-main wide">
        <article className="doc">
          <h1>Playground</h1>
          {locale === 'en' ? (
            <>
              <p>
                Write <code>.comat</code> and try the highlighting. The editor is{' '}
                <a href="https://microsoft.github.io/monaco-editor/" target="_blank" rel="noreferrer noopener">
                  Monaco
                </a>
                , and the grammar is the same as the VS Code extension&apos;s.
              </p>
              <p>
                The check below is a small version that only looks at <strong>bracket matching</strong> and the{' '}
                <strong>status-code rules</strong> (is the code registered, can it have a body). Type resolution, matching <code>path</code>{' '}
                against <code>params</code>, route duplicates and so on are checked by <code>comatype check</code> and the{' '}
                <a href={editor}>VS Code extension</a>.
              </p>
            </>
          ) : (
            <>
              <p>
                <code>.comat</code> を書いて、色分けを試せます。エディタは{' '}
                <a href="https://microsoft.github.io/monaco-editor/" target="_blank" rel="noreferrer noopener">
                  Monaco
                </a>{' '}
                で、文法は VS Code 拡張と同じものです。
              </p>
              <p>
                下のチェックは、<strong>括弧の対応</strong>と<strong>ステータスコードの規則</strong>
                （登録されたコードか、本文を持てるか）だけを見る簡易版です。型の解決、<code>path</code> と <code>params</code>{' '}
                の突き合わせ、ルートの重複などの検査は、
                <code>comatype check</code> と <a href={editor}>VS Code 拡張</a>が行います。
              </p>
            </>
          )}
          <Playground />
        </article>
      </main>
    </div>
  )
}

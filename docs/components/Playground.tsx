'use client'

import type * as Monaco from 'monaco-editor'
// A place to write .comat and try the highlighting and the small check.
// The check only covers bracket matching and the status-code rules (the real check is `comatype check` / the VS Code extension).
import { useCallback, useRef, useState } from 'react'
import statuses from '../data/status-codes.json'
import { lintComat, type Problem } from '../lib/lint'
import { ComatEditor } from './ComatEditor'
import { useLocale } from './useLocale'

interface Example {
  name: string
  text: string
}

const examplesEn: Example[] = [
  {
    name: 'Endpoint (PUT /user/:id)',
    text: `// user/[id]/put.comat: PUT /user/:id (the path is decided by where the file is and its name)
import UserData from ../../../types/UserData.comat
import ApiError from ../../../types/common.comat

params {
    id: uuidv4,
}

body UserData

s200 UserData
s404 ApiError
`,
  },
  {
    name: 'Types and enums',
    text: `enum Role {
    admin,
    member,
    guest,
}

Profile {
    nickname: string(1..50),
    age?: int(0..150),
    zip: string(pattern: "^[0-9]{3}-[0-9]{4}$"),
    role: Role,
    status: "active" | "banned",
    followers: int64,
    balance: decimal,
    deletedAt: datetime | null,
    tags: string[],
    home: { line1: string, line2?: string },
}
`,
  },
  {
    name: 'Status codes',
    text: `// Omitting the body type gives the default body { message: string }
s400
s404

// Codes that cannot have a body use none
s204 none

// A type can be given; response headers can be written too
s200 none, {
    Allow: string[],
}

// The next two lines are errors
s499 none
s204 UserData
`,
  },
  {
    name: 'Caching',
    text: `// user/get.comat: GET /user
// Cache the response in memory for 5 seconds (client and server).
// \`cache off\` turns it off; \`cache 5000 cookie\` caches in a cookie (client only).
cache 5000

search {
    limit?: int,
}

s200 UserData[]
`,
  },
  {
    name: 'init.comat',
    text: `baseUrl https://api.example.com

cookie session {
    httpOnly: true,
    secure: true,
    sameSite: lax,
}

wrapper auth {
    ctx {
        user: UserData,
    }
    s401
}
`,
  },
]

const examplesJa: Example[] = [
  {
    name: 'エンドポイント（PUT /user/:id）',
    text: `// user/[id]/put.comat: PUT /user/:id（path はファイルの置き場所と名前から決まる）
import UserData from ../../../types/UserData.comat
import ApiError from ../../../types/common.comat

params {
    id: uuidv4,
}

body UserData

s200 UserData
s404 ApiError
`,
  },
  {
    name: '型と enum',
    text: examplesEn[1].text,
  },
  {
    name: 'ステータスコード',
    text: `// 本文の型を省略すると、既定の本文 { message: string }
s400
s404

// 本文を持てないコードは none
s204 none

// 型を指定してもよい。レスポンスヘッダも書ける
s200 none, {
    Allow: string[],
}

// 次の 2 行は、エラーになる
s499 none
s204 UserData
`,
  },
  {
    name: 'キャッシュ',
    text: `// user/get.comat: GET /user
// 5 秒だけ、レスポンスをメモリにキャッシュする（クライアントもサーバも）。
// \`cache off\` で切る、\`cache 5000 cookie\` で cookie にキャッシュする（クライアントのみ）。
cache 5000

search {
    limit?: int,
}

s200 UserData[]
`,
  },
  { name: 'init.comat', text: examplesEn[4].text },
]

const strings = {
  en: { example: 'Example', ok: 'No problems found', problems: (n: number) => `${n} problem${n === 1 ? '' : 's'}`, list: 'Problems' },
  'ja-jp': { example: '見本', ok: '問題は見つかりませんでした', problems: (n: number) => `${n} 件の問題`, list: '問題の一覧' },
}

export function Playground() {
  const locale = useLocale()
  const examples = locale === 'en' ? examplesEn : examplesJa
  const t = strings[locale]
  const [selected, setSelected] = useState(0)
  const [text, setText] = useState(examples[0].text)
  const [problems, setProblems] = useState<Problem[]>([])
  const monacoRef = useRef<typeof Monaco>(undefined)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor>(undefined)

  const check = useCallback(
    (value: string) => {
      const found = lintComat(value, statuses, locale)
      setProblems(found)
      const monaco = monacoRef.current
      const model = editorRef.current?.getModel()
      if (!monaco || !model) return
      monaco.editor.setModelMarkers(
        model,
        'comatype-playground',
        found.map((p) => ({
          startLineNumber: p.line,
          startColumn: p.column,
          endLineNumber: p.line,
          endColumn: p.endColumn,
          message: p.message,
          severity: p.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        })),
      )
    },
    [locale],
  )

  const onReady = useCallback(
    (monaco: typeof Monaco, editor: Monaco.editor.IStandaloneCodeEditor) => {
      monacoRef.current = monaco
      editorRef.current = editor
      check(editor.getValue())
    },
    [check],
  )

  const onChange = useCallback(
    (v: string) => {
      setText(v)
      check(v)
    },
    [check],
  )

  function pick(i: number) {
    setSelected(i)
    setText(examples[i].text)
    check(examples[i].text)
  }

  return (
    <div className="playground">
      <div className="bar">
        <label htmlFor="example">{t.example}</label>
        <select id="example" value={selected} onChange={(e) => pick(Number(e.target.value))}>
          {examples.map((e, i) => (
            <option key={e.name} value={i}>
              {e.name}
            </option>
          ))}
        </select>
        <span className={problems.length === 0 ? 'summary ok' : 'summary'}>
          {problems.length === 0 ? t.ok : t.problems(problems.length)}
        </span>
      </div>
      <ComatEditor value={text} height={420} onChange={onChange} onReady={onReady} />
      {problems.length > 0 && (
        <ul className="problems" aria-label={t.list}>
          {problems.map((p) => (
            <li key={`${p.line}:${p.column}:${p.message}`}>
              <code>
                {p.line}:{p.column}
              </code>{' '}
              {p.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

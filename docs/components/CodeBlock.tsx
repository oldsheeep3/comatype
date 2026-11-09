// Code block: adds the language label and a copy button (the highlighting is HTML that shiki already produced)
import type { ComponentPropsWithoutRef } from 'react'
import { CopyButton } from './CopyButton'

type PreProps = ComponentPropsWithoutRef<'pre'> & { 'data-title'?: string; 'data-lang'?: string }

const LANG_LABEL: Record<string, string> = { comat: 'comat', ts: 'TypeScript', tsx: 'TSX', go: 'Go', python: 'Python', json: 'JSON', bash: 'shell', yaml: 'YAML', text: '' }

export function CodeBlock({ children, className, style, 'data-title': title, 'data-lang': lang, ...rest }: PreProps) {
  const label = title ?? (lang ? (LANG_LABEL[lang] ?? lang) : '')
  return (
    <div className="code-block" data-lang={lang}>
      {title && <div className="code-title">{title}</div>}
      {label && !title && <span className="code-lang">{label}</span>}
      <CopyButton />
      <pre className={className} style={style} tabIndex={0} {...rest}>
        {children}
      </pre>
    </div>
  )
}

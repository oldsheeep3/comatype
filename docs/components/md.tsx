// React components applied to Markdown elements (the `components` of rehype-react)

import Link from 'next/link'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { CodeBlock } from './CodeBlock'
import { CodeGroup } from './CodeGroup'
import { StatusTable } from './StatusTable'

type Props<T extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<T>

function Heading(level: 2 | 3 | 4) {
  const Tag = `h${level}` as const
  return function H({ id, children, ...rest }: Props<'h2'>) {
    return (
      <Tag id={id} {...rest}>
        {children}
        {id && (
          <a className="anchor" href={`#${id}`} aria-label="Link to this heading">
            #
          </a>
        )}
      </Tag>
    )
  }
}

function A({ href = '', children, ...rest }: Props<'a'>) {
  if (href.startsWith('/')) return <Link href={href}>{children}</Link>
  if (href.startsWith('#')) return <a href={href}>{children}</a>
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
      {children}
    </a>
  )
}

function Table({ children }: { children?: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  )
}

export const mdComponents = {
  h2: Heading(2),
  h3: Heading(3),
  h4: Heading(4),
  a: A,
  table: Table,
  pre: CodeBlock,
  'code-group': CodeGroup,
  'x-statustable': StatusTable,
} as never

import type { Metadata } from 'next'
import { PlaygroundPage } from '../../../components/PlaygroundPage'

export const metadata: Metadata = { title: 'Playground' }

export default function Page() {
  return <PlaygroundPage locale="ja-jp" />
}

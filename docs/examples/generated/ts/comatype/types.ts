// 自動生成: comatype generate が作ったファイルです。手で編集しないでください
import { t, type Schema, type Uuidv4 } from '@comatype/typescript'

export type Todo = {
  id: Uuidv4;
  title: string;
  done: boolean;
}
export const Todo: Schema<Todo> = t.object({
  id: t.uuidv4(),
  title: t.string(),
  done: t.bool(),
})

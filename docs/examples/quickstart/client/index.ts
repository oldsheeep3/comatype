import { c } from '@comatype/typescript'
import { path as postTodo, s200 as postTodoOk, s400 } from '@/comatype/post_todo'
import { path as getTodo, s200 as getTodoOk, s404 } from '@/comatype/todo/__id/get'

// ボディは送る前に検証され、レスポンスは受け取った後に検証される
const created = await c.post(postTodo, { title: 'milk' }, postTodoOk, s400)
if (created.status === 200) {
  console.log(created.data.id) // Todo
  const found = await c.get(getTodo, { params: { id: created.data.id } }, getTodoOk, s404)
  if (found.status === 404) console.log(found.error.message)
} else {
  console.log(created.error.message) // s400 の既定の本文: { message: string }
}

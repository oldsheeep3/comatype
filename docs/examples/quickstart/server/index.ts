import { s } from '@comatype/typescript'
import { serve } from '@comatype/typescript/node'
import type { Todo } from '@/comatype/types'
import { path as postTodo, s200 as postTodoOk } from '@/comatype/post_todo'
import { path as getTodo, s200 as getTodoOk, s404 } from '@/comatype/todo/__id/get'

const todos = new Map<string, Todo>()

s.post(postTodo, (req) => {
  // req.body は検証済み: { title: string }（1〜100 文字）
  const todo: Todo = { id: crypto.randomUUID(), title: req.body.title, done: false }
  todos.set(todo.id, todo)
  return postTodoOk({ data: todo })
})

s.get(getTodo, (req) => {
  // req.params.id は uuidv4 と確かめてある
  const todo = todos.get(req.params.id)
  if (!todo) return s404({ error: { message: 'todo not found' } })
  return getTodoOk({ data: todo })
})

await serve({ port: 3000, server: s })

// Connect to the Node http server: `import { serve } from '@comatype/typescript/node'`

import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { s as defaultServer } from './server.ts'
import type { Server } from './server.ts'

export function nodeListener(server: Server = defaultServer) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x))
      else if (v !== undefined) headers.set(k, v)
    }
    const method = req.method ?? 'GET'
    const hasBody = method !== 'GET' && method !== 'HEAD' && chunks.length > 0
    const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`
    const response = await server.handle(new Request(url, { method, headers, body: hasBody ? Buffer.concat(chunks) : undefined }))
    const out: Record<string, string | string[]> = {}
    response.headers.forEach((v, k) => {
      if (k !== 'set-cookie') out[k] = v
    })
    const cookies = response.headers.getSetCookie?.() ?? []
    if (cookies.length) out['set-cookie'] = cookies
    res.writeHead(response.status, out)
    res.end(Buffer.from(await response.arrayBuffer()))
  }
}

/** Start the server. Passing 0 as port uses a free port */
export function serve(options: { port: number; host?: string; server?: Server }): Promise<http.Server> {
  const srv = http.createServer(nodeListener(options.server))
  return new Promise((ok, ng) => {
    srv.once('error', ng)
    srv.listen(options.port, options.host ?? '127.0.0.1', () => ok(srv))
  })
}

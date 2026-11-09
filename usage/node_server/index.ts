// Start the server: PORT=3000 pnpm start (a free port if PORT is not set)
import { serve } from '@comatype/typescript/node'
import { s } from './app'

const server = await serve({ port: Number(process.env.PORT ?? 0), server: s })
const address = server.address()
const port = typeof address === 'object' && address ? address.port : 0
// The test reads this port
console.log(`LISTENING http://127.0.0.1:${port}`)

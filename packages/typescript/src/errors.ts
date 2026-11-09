export class ComatypeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ComatypeError'
  }
}

/** A response was returned that matches neither the statuses the caller passed nor the BUILT responses */
export class UnexpectedStatusError extends ComatypeError {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`想定していないステータス ${status} が返りました（c.xxx に渡していない s${status} かもしれません）`)
    this.name = 'UnexpectedStatusError'
    this.status = status
    this.body = body
  }
}

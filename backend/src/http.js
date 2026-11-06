import { DomainError } from './errors.js'

export function jsonHandler(action) {
  return async function handler(request) {
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
    try {
      const body = request.method === 'GET' ? null : await request.json()
      const data = await action({ request, body, requestId })
      return Response.json({ requestId, data }, { status: 200, headers: { 'cache-control': 'no-store' } })
    } catch (error) {
      const known = error instanceof DomainError
      console.error(JSON.stringify({ requestId, event: 'request_failed', code: known ? error.code : 'INTERNAL_ERROR' }))
      return Response.json({ requestId, error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Unexpected server error', details: known ? error.details : undefined } }, { status: known ? 400 : 500 })
    }
  }
}

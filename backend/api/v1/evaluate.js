import { evaluateHoldingRule } from '../../src/eligibility.js'
import { DomainError } from '../../src/errors.js'

export async function POST(request) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  try {
    const body = await request.json()
    const result = evaluateHoldingRule(body.rule, body.checkpoints, body.now ?? Date.now())
    return Response.json({ requestId, data: result })
  } catch (error) {
    console.error(JSON.stringify({ requestId, event: 'eligibility_evaluation_failed', code: error.code ?? 'INTERNAL_ERROR' }))
    const known = error instanceof DomainError
    return Response.json({ requestId, error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Unexpected server error' } }, { status: known ? 400 : 500 })
  }
}

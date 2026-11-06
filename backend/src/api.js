import { jsonHandler } from './http.js'
import { invariant } from './errors.js'
const requirePost = request => invariant(request.method === 'POST', 'METHOD_NOT_ALLOWED', 'This endpoint requires POST')
export function createTotemApi({ service, repository }) {
  invariant(service && repository, 'API_CONFIGURATION_INVALID', 'Totem API requires a service and repository')
  return {
    createCampaign: jsonHandler(async ({ request, body }) => { requirePost(request); return service.createCampaign(body) }),
    evaluateEligibility: jsonHandler(async ({ request, body }) => { requirePost(request); return service.evaluate(body) }),
    prepareMint: jsonHandler(async ({ request, body }) => { requirePost(request); return service.prepareMint(body) }),
    listEvents: jsonHandler(async ({ request }) => {
      invariant(request.method === 'GET', 'METHOD_NOT_ALLOWED', 'This endpoint requires GET')
      const url = new URL(request.url), campaignId = url.searchParams.get('campaignId')
      const afterSequence = Number(url.searchParams.get('afterSequence') ?? 0)
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 100)
      invariant(campaignId, 'CAMPAIGN_ID_REQUIRED', 'campaignId is required')
      invariant(Number.isSafeInteger(afterSequence) && afterSequence >= 0, 'CURSOR_INVALID', 'afterSequence must be a non-negative integer')
      invariant(Number.isSafeInteger(limit) && limit > 0, 'LIMIT_INVALID', 'limit must be a positive integer')
      return repository.listEvents({ campaignId, afterSequence, limit })
    })
  }
}

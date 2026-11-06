import { invariant } from './errors.js'

export function routeFee(amount, policy) {
  invariant(Number.isSafeInteger(amount) && amount > 0, 'FEE_AMOUNT_INVALID', 'Fee amount must be a positive integer in smallest units')
  invariant(policy.routes.length > 0, 'FEE_POLICY_INVALID', 'Fee policy needs at least one route')
  invariant(policy.routes.reduce((sum, route) => sum + route.basisPoints, 0) === 10_000, 'FEE_POLICY_INVALID', 'Fee routes must total exactly 10,000 basis points')
  invariant(new Set(policy.routes.map(route => route.destination)).size === policy.routes.length, 'FEE_POLICY_INVALID', 'Fee destinations must be unique')
  const allocations = policy.routes.map(route => ({ ...route, amount: Math.floor(amount * route.basisPoints / 10_000) }))
  const allocated = allocations.reduce((sum, route) => sum + route.amount, 0)
  allocations[0].amount += amount - allocated
  return { policyId: policy.id, amount, allocations }
}

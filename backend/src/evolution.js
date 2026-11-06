import { invariant } from './errors.js'

export function chooseEvolution(branches, signals) {
  invariant(Array.isArray(branches) && branches.length > 0, 'EVOLUTION_INVALID', 'At least one evolution branch is required')
  const matches = branches.filter(branch => branch.requirements.every(requirement => (signals[requirement.signal] ?? 0) >= requirement.minimum))
  invariant(matches.length > 0, 'EVOLUTION_NOT_UNLOCKED', 'No evolution branch is currently unlocked')
  matches.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
  return { branchId: matches[0].id, role: matches[0].role, matchedBranches: matches.map(branch => branch.id) }
}

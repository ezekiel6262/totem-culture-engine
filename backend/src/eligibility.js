import { invariant } from './errors.js'

const DAY_MS = 86_400_000

export function evaluateHoldingRule(rule, checkpoints, now = Date.now()) {
  invariant(rule.kind === 'time_weighted_balance', 'RULE_KIND_UNSUPPORTED', 'Expected a time-weighted balance rule')
  invariant(Number.isSafeInteger(rule.minimumBalance) && rule.minimumBalance > 0, 'RULE_INVALID', 'minimumBalance must be a positive safe integer')
  invariant(Number.isInteger(rule.windowDays) && rule.windowDays > 0, 'RULE_INVALID', 'windowDays must be a positive integer')
  invariant(Number.isInteger(rule.minimumCoveredDays) && rule.minimumCoveredDays > 0 && rule.minimumCoveredDays <= rule.windowDays, 'RULE_INVALID', 'minimumCoveredDays must fit inside windowDays')

  const start = now - rule.windowDays * DAY_MS
  const unique = new Map()
  for (const point of checkpoints) {
    invariant(Number.isSafeInteger(point.balance) && point.balance >= 0, 'CHECKPOINT_INVALID', 'Checkpoint balance must be a non-negative safe integer')
    invariant(Number.isSafeInteger(point.observedAt), 'CHECKPOINT_INVALID', 'Checkpoint time must be an integer timestamp')
    if (point.observedAt >= start && point.observedAt <= now) unique.set(point.period, point)
  }

  const ordered = [...unique.values()].sort((a, b) => a.observedAt - b.observedAt)
  const qualifying = ordered.filter(point => point.balance >= rule.minimumBalance)
  const weightedBalance = ordered.reduce((sum, point) => sum + point.balance, 0)
  const requiredScore = rule.minimumBalance * rule.minimumCoveredDays
  const score = weightedBalance
  const eligible = qualifying.length >= rule.minimumCoveredDays && score >= requiredScore

  return {
    eligible,
    ruleKind: rule.kind,
    coveredDays: ordered.length,
    qualifyingDays: qualifying.length,
    score,
    requiredScore,
    progressBps: Math.min(10_000, Math.floor(score * 10_000 / requiredScore)),
    windowStart: start,
    evaluatedAt: now,
    reasons: eligible ? [] : [
      ...(qualifying.length < rule.minimumCoveredDays ? ['INSUFFICIENT_DURATION'] : []),
      ...(score < requiredScore ? ['INSUFFICIENT_WEIGHTED_BALANCE'] : [])
    ]
  }
}

import { analyzeEnemySpawns } from './enemySpawnConditions.mjs'
import { ENEMY_UNIT_ROLE_SOURCE_REVISION, getNonEnemyUnitRole } from './enemyUnitRoles.mjs'
import { getVerifiedNonEnemyUnit } from './nonEnemyBranchPolicy.mjs'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const emptyObject = value => record(value) && Object.keys(value).length === 0
const count = value => Number.isSafeInteger(value) && value >= 0
const PARTIAL_REASONS = new Set([
  'branch-spawn', 'random-spawn-group', 'weighted-spawn', 'unsupported-wave-tag', 'unscheduled-spawn',
  'conditional-spawn:randomType', 'conditional-spawn:refreshType',
  'conditional-spawn:condition', 'conditional-spawn:conditions',
])

// Some upstream empty collections are exported as {}. Only that exact empty
// representation is harmless; null, missing fields and nonempty records remain
// malformed. Keep the original analysis/reasons and source indices unchanged.
function emptyCollectionReason(level, reason) {
  if (reason === 'invalid-fragments') {
    return Array.isArray(level?.waves) && level.waves.every(wave => record(wave)
      && (Array.isArray(wave.fragments) || (emptyObject(wave.fragments)
        && Object.keys(wave).every(key => ['fragments', 'preDelay', 'postDelay', 'maxTimeWaitingForNextWave', 'advancedWaveTag'].includes(key)))))
  }
  if (reason === 'invalid-branch-actions') {
    return record(level?.branches) && Object.values(level.branches).every(branch => record(branch)
      && Array.isArray(branch.phases) && branch.phases.every(phase => record(phase)
        && (Array.isArray(phase.actions) || emptyObject(phase.actions))))
  }
  return false
}

// The legacy analyzer deliberately reports unresolved branch actions together
// as `branch-spawn`. Before admitting a partial map, validate those actions with
// the same action/rune resolver so malformed counts or uncertain replacements
// cannot be mistaken for merely optional extra enemies.
function partialBranchesAreValid(level, context) {
  if (level?.branches == null) return true
  if (!record(level.branches)) return false
  const actions = []
  for (const branch of Object.values(level.branches)) {
    if (!record(branch) || Object.keys(branch).some(key => key !== 'phases') || !Array.isArray(branch.phases)) return false
    for (const phase of branch.phases) {
      if (!record(phase) || Object.keys(phase).some(key => !['actions', 'preDelay'].includes(key))) return false
      if (emptyObject(phase.actions)) continue
      if (!Array.isArray(phase.actions)) return false
      actions.push(...phase.actions)
    }
  }
  const validation = analyzeEnemySpawns({ ...level, branches: {}, waves: [{ fragments: [{ actions }] }] }, context)
  return [...validation.reasons].every(reason => PARTIAL_REASONS.has(reason))
}

/**
 * V4's lower-bound convention uses the fixed normal schedule and independently
 * verified mandatory branches. It does not infer execution counts for unknown
 * branches or random choices. Omitted contributions are unresolved, not absent.
 * Exact/legacy callers retain their original all-or-nothing admission policy.
 * Both the histogram and coverage index must use this decision and hostile
 * count, rather than each deciding whether a partial map is usable.
 */
export function resolveEnemySpawnAggregation(level, context, { mode = 'strict', analysis } = {}) {
  if (!['strict', 'lower-bound', 'expected-lower-bound'].includes(mode)) throw new Error('Unknown enemy spawn aggregation mode')
  const resolutionContext = context ? { ...context, randomSpawnMode: mode === 'expected-lower-bound' ? 'expected' : 'lower-bound' } : context
  // A caller may reuse a precomputed analysis, but expected frequencies must
  // never be relabelled as guaranteed lower bounds by a different caller mode.
  const source = analysis && !(analysis.hasExpectedSpawns && mode !== 'expected-lower-bound')
    ? analysis : analyzeEnemySpawns(level, resolutionContext)
  const expected = mode === 'expected-lower-bound' && source.hasExpectedSpawns === true
  const validAmount = amount => expected
    ? typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && amount <= Number.MAX_SAFE_INTEGER : count(amount)
  const reasons = [...source.reasons].sort()
  const counts = new Map(source.counts)
  const result = { kind: 'excluded', counts, reasons, count: null,
    excludedNonEnemySpawns: [], unverifiedNonEnemySpawns: [] }
  let total = 0
  for (const amount of counts.values()) {
    if (!validAmount(amount) || !validAmount(total += amount)) return result
  }
  if (reasons.length && (mode === 'strict'
    || reasons.some(reason => !PARTIAL_REASONS.has(reason) && !emptyCollectionReason(level, reason)))) return result
  if (reasons.length && !partialBranchesAreValid(level, context)) return result

  // Preserve V3's role/reference checks: only reviewed normal-wave non-enemies
  // are removed, never same-ID hostile waves merely because a branch was omitted.
  if (context?.sourceRevision === ENEMY_UNIT_ROLE_SOURCE_REVISION) {
    const normalCounts = new Map()
    for (const action of source.actions) {
      if (action.status !== 'included' || !(action.resolvedCount > 0) || !getNonEnemyUnitRole(action.resolvedEnemyId)) continue
      normalCounts.set(action.resolvedEnemyId, (normalCounts.get(action.resolvedEnemyId) ?? 0) + action.resolvedCount)
    }
    // Random alternatives contribute a per-enemy lower bound, not a selected
    // concrete action. Apply the same reviewed civilian/non-enemy exclusions.
    for (const entry of source.countedRandomSpawns ?? []) {
      if (entry.count > 0 && getNonEnemyUnitRole(entry.enemyId)) {
        normalCounts.set(entry.enemyId, (normalCounts.get(entry.enemyId) ?? 0) + entry.count)
      }
    }
    for (const [enemyId, amount] of normalCounts) {
      const verified = getVerifiedNonEnemyUnit(level, context, enemyId)
      if (verified) {
        const remaining = counts.get(enemyId) - amount
        if (!validAmount(remaining)) return { ...result, excludedNonEnemySpawns: [], unverifiedNonEnemySpawns: [] }
        counts.set(enemyId, remaining)
        total -= amount
        result.excludedNonEnemySpawns.push({ ...verified, count: amount })
      } else result.unverifiedNonEnemySpawns.push({ enemyId, count: amount,
        reason: 'unverified-reference-or-override', condition: '参照・上書きから役割を確定できないため、従来の出現数を維持' })
    }
  }
  // A partial map with no known hostile contribution must not inflate coverage.
  // Re-sum the remaining per-enemy values: sequential subtraction of fractional
  // civilian contributions can leave a tiny positive floating-point residue.
  total = [...counts.values()].reduce((sum, amount) => sum + amount, 0)
  if (!validAmount(total)) return result
  if (reasons.length && total === 0) return { ...result, excludedNonEnemySpawns: [], unverifiedNonEnemySpawns: [] }
  return { ...result, kind: expected ? 'expected-lower-bound' : reasons.length ? 'lower-bound' : 'exact', count: total }
}

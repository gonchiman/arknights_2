// Reviewed against the same source snapshot as the IG wave policies. A future
// snapshot must be reviewed before these mode-specific assumptions are reused.
export const RANDOM_SPAWN_SOURCE_REVISION = '60e3aaf434919fbca931024a59d51088e810a9d3'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const emptyKey = value => value == null || value === ''
const key = value => typeof value === 'string' && value.length > 0 && value.trim() === value
const validWeight = value => value == null || (Number.isSafeInteger(value) && value >= 0)
const validCount = value => Number.isSafeInteger(value) && value >= 0
const RANDOM_ACTION_TYPES = new Set(['SPAWN', 'ACTIVATE_PREDEFINED', 'EMPTY'])
const EVIDENCE = [
  'GameAssembly.dll SHA-256 c673ec1964a8f2b51b8cb867b5fb697b1f3f283452aeb4b568cd749d5dfc3864',
  'CooperateGameMode.GetSchedulerPreprocessor RVA 0x93D070 uses CooperatePreProcessor (constructor call 0x93D0FA)',
  'CooperatePreProcessor.DoPreprocess RVA 0x6F6930: group key is (wave, fragment, randomSpawnGroupKey); only grouped actions enter the weighted draw (0x6F6D78-0x6F6E1C)',
  'CooperatePreProcessor.DoPreprocess: one choice per group (0x6F7029); unchosen actions and their pack members are removed (0x6F7340-0x6F74C4)',
  'CooperatePreProcessor bonus/bonus_f groups depend on result state (0x6F7044-0x6F70DD) and are not included in this bound',
]
const EXPECTED_EVIDENCE = [
  ...EVIDENCE,
  'Cooperate weighted call 0x6F7029: IBattleRandom.UniformWithWeight MethodSpec 267460 (method definition 61764); BattleRandomWrapper generic body 0x3F4E120 delegates to RandomExtensions.UniformWithWeight 0x40B9CE0',
  'RandomExtensions.UniformWithWeight: sum weights at 0x40B9EE5, Range(0, sum) at 0x40B9F68, subtract each rejected weight at 0x40BA185; theoretical probability = weight / sum(weight)',
  'Theoretical weighted expectation, not a seed replay: native Range uses float32 (0x1A0314A) and comparison epsilon approximately 1e-5 (0x5A452A0), which can cause tiny boundary-probability differences',
]
const EXPECTED_CONDITION = '抽選重みに基づく理論期待出現数（既知分のみ）'
const validExpectation = value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER

function reviewedContext(context) {
  return context?.sourceRevision === RANDOM_SPAWN_SOURCE_REVISION
    && /^activities\/(?:act1multi|act2multi|act2vmulti)\/level_[^/]+$/.test(context.levelId ?? '')
    // Both football maps and their tr02 tutorials replace team enemy identities
    // after selection; that separate runtime transform has not been resolved.
    && !/(?:football|_tr02$)/.test(context.levelId)
}

/**
 * Resolve an ordinary wave fragment's random groups without selecting a seed.
 * resolveCandidate(action, index) uses the normal action/rune resolver after
 * clearing only random group/pack/weight fields. Conditional or unknown results
 * contribute zero to the bound; original diagnostics must remain in the caller.
 *
 * Counts are per-enemy minima across EVERY candidate, not a sum of alternative
 * packs or the total of an arbitrarily chosen cheapest pack. Their sum need not
 * be attainable in one play. It is a lower bound for each enemy independently.
 *
 * The normal-wave preprocessor deletes the packs of unchosen candidates. Shared
 * pack keys could therefore delete a chosen candidate's followers too. Reject
 * all affected groups rather than guessing correlations or double counting.
 * Branch PhaseData has a different implementation and must not use this helper.
 *
 * Opt-in mode:'expected' additionally returns nominal weighted expectations.
 * Unknown outcomes retain their original probability and contribute zero; they
 * are not removed from the denominator. Callers must choose expectedSpawns OR
 * countedSpawns, never sum them. This is an expectation of the known portion,
 * not a guaranteed integer count or a bit-exact simulation of native rounding.
 */
export function getRandomSpawnPhaseResolution(phase, context, resolveCandidate, options = {}) {
  const expectedMode = options?.mode === 'expected'
  const result = { fixedWeightIndices: new Set(), countedSpawns: [], groups: [], evidence: [] }
  if (expectedMode) Object.assign(result, { expectedSpawns: [], expectedGroups: [] })
  if (!reviewedContext(context) || !record(phase) || !Array.isArray(phase.actions)) return result
  const actions = phase.actions
  const groups = new Map(), packs = new Map(), packCandidates = new Map()
  for (const [index, action] of actions.entries()) {
    if (!record(action)) continue
    const group = action.randomSpawnGroupKey, pack = action.randomSpawnGroupPackKey
    if (action.actionType === 'SPAWN' && emptyKey(group) && emptyKey(pack)
      && validWeight(action.weight) && action.weight > 0) result.fixedWeightIndices.add(index)
    if (key(pack)) packs.set(pack, [...(packs.get(pack) ?? []), index])
    if (emptyKey(group)) continue
    // Preserve malformed names as unresolved instead of trimming/merging them.
    if (!key(group)) continue
    groups.set(group, [...(groups.get(group) ?? []), index])
    if (key(pack)) packCandidates.set(pack, [...(packCandidates.get(pack) ?? []), index])
  }
  for (const [groupKey, candidates] of groups) {
    if (typeof resolveCandidate !== 'function') continue
    if (groupKey === 'bonus' || groupKey === 'bonus_f') continue
    if (candidates.some(index => {
      const action = actions[index], pack = action.randomSpawnGroupPackKey
      return !RANDOM_ACTION_TYPES.has(action.actionType) || !validWeight(action.weight)
        || (!emptyKey(pack) && (!key(pack) || packCandidates.get(pack)?.length !== 1))
    })) continue
    const totalWeight = candidates.reduce((sum, index) => sum + (actions[index].weight ?? 0), 0)
    if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) continue
    // Every integer up to 2^24 is represented exactly by the native float32
    // weight accumulator. Larger sums need a separate rounding-aware policy.
    const canExpect = expectedMode && totalWeight <= 2 ** 24
    const alternativeCounts = [], expectedAlternatives = [], usedIndices = new Set()
    let valid = true
    for (const index of candidates) {
      const candidate = actions[index]
      const counts = new Map()
      // The old minimum mode keeps activation outcomes conservatively empty.
      // In expected mode a selected nonempty activation/EMPTY key retains its
      // pack just like a SPAWN (native empty-key check at 0x6F703A). Count only
      // explicit SPAWN followers; do not infer activation side effects.
      if ((candidate.actionType === 'SPAWN' || canExpect) && key(candidate.key)) {
        const indices = key(candidate.randomSpawnGroupPackKey)
          ? packs.get(candidate.randomSpawnGroupPackKey) : [index]
        for (const actionIndex of indices) {
          const action = actions[actionIndex]
          if (action.actionType !== 'SPAWN') continue
          // Unknown group references in a pack cannot be treated as followers.
          if (actionIndex !== index && !emptyKey(action.randomSpawnGroupKey)) { valid = false; break }
          const resolution = resolveCandidate(action, actionIndex)
          if (resolution?.status !== 'included') continue
          const amount = resolution.resolvedCount, enemyId = resolution.resolvedEnemyId
          if (!validCount(amount) || !key(enemyId)) { valid = false; break }
          const total = (counts.get(enemyId) ?? 0) + amount
          if (!validCount(total)) { valid = false; break }
          counts.set(enemyId, total)
          usedIndices.add(actionIndex)
        }
      }
      if (!valid) break
      alternativeCounts.push(candidate.actionType === 'SPAWN' ? counts : new Map())
      expectedAlternatives.push(counts)
    }
    if (!valid || !alternativeCounts.length) continue
    const groupCounts = []
    for (const [enemyId, firstCount] of alternativeCounts[0]) {
      const minimum = Math.min(firstCount, ...alternativeCounts.slice(1).map(counts => counts.get(enemyId) ?? 0))
      if (minimum > 0) groupCounts.push({ enemyId, count: minimum, groupKey,
        candidateCount: candidates.length, sourceActionIndices: [...usedIndices].sort((a, b) => a - b),
        conditions: ['ランダム抽選の全候補に共通する出現数'],
        evidence: [...EVIDENCE, `group=${JSON.stringify(groupKey)}, candidate action indices=${candidates.join(',')}; per-enemy minimum across ${candidates.length} candidates`] })
    }
    result.countedSpawns.push(...groupCounts)
    result.groups.push({ groupKey, candidateCount: candidates.length,
      count: groupCounts.reduce((sum, entry) => sum + entry.count, 0) })
    if (canExpect) {
      const expected = new Map(), outcomes = []
      for (const [candidateIndex, index] of candidates.entries()) {
        const weight = actions[index].weight ?? 0, probability = weight / totalWeight
        const counts = expectedAlternatives[candidateIndex]
        const outcomeTotal = [...counts.values()].reduce((sum, count) => sum + count, 0)
        if (!validCount(outcomeTotal)) { valid = false; break }
        outcomes.push({ actionIndex: index, weight, probability, knownCount: outcomeTotal })
        if (weight === 0) continue
        for (const [enemyId, amount] of counts) {
          const next = (expected.get(enemyId) ?? 0) + amount * probability
          if (!validExpectation(next)) { valid = false; break }
          expected.set(enemyId, next)
        }
        if (!valid) break
      }
      const expectedCount = [...expected.values()].reduce((sum, count) => sum + count, 0)
      if (valid && validExpectation(expectedCount)) {
        const evidence = [...EXPECTED_EVIDENCE,
          `group=${JSON.stringify(groupKey)}, total weight=${totalWeight}; candidates=${JSON.stringify(outcomes)}`]
        for (const [enemyId, count] of expected) if (count > 0) result.expectedSpawns.push({
          enemyId, count, groupKey, candidateCount: candidates.length,
          sourceActionIndices: [...usedIndices].sort((a, b) => a - b),
          conditions: [EXPECTED_CONDITION], evidence,
        })
        result.expectedGroups.push({ groupKey, candidateCount: candidates.length, totalWeight,
          count: expectedCount, candidates: outcomes, conditions: [EXPECTED_CONDITION], evidence })
      }
    }
  }
  if (result.fixedWeightIndices.size || result.countedSpawns.length) result.evidence = [...EVIDENCE]
  if (result.expectedGroups?.length) result.evidence = [...EXPECTED_EVIDENCE]
  return result
}

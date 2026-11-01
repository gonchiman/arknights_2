import test from 'node:test'
import assert from 'node:assert/strict'
import { getRandomSpawnPhaseResolution, RANDOM_SPAWN_SOURCE_REVISION } from '../scripts/lib/randomSpawnPolicy.mjs'

const context = { sourceRevision: RANDOM_SPAWN_SOURCE_REVISION, levelId: 'activities/act1multi/level_act1multi_01' }
const spawn = (key, count = 1, extra = {}) => ({ actionType: 'SPAWN', key, count, ...extra })
const candidate = (key, count, pack, extra = {}) => spawn(key, count, {
  randomSpawnGroupKey: 'g', randomSpawnGroupPackKey: pack, weight: 50, ...extra,
})
const resolve = action => action.hiddenGroup === 'disabled'
  ? { status: 'excluded', resolvedCount: 0 }
  : action.condition ? { status: 'conditional' }
    : { status: 'included', resolvedEnemyId: action.replace ?? action.key, resolvedCount: action.count }
const analyze = actions => getRandomSpawnPhaseResolution({ actions }, context, resolve)
const counts = result => result.countedSpawns.map(({ enemyId, count, groupKey }) => [enemyId, count, groupKey])
const expected = (actions, resolver = resolve, override = {}) => getRandomSpawnPhaseResolution(
  { actions }, { ...context, ...override }, resolver, { mode: 'expected' })
const expectedCounts = result => Object.fromEntries(result.expectedSpawns.map(({ enemyId, count }) => [enemyId, count]))

test('ungrouped weights are inert, but pack members and malformed values remain unresolved', () => {
  const actions = [spawn('fixed', 3, { weight: 50 }), spawn('pack', 5, { weight: 50, randomSpawnGroupPackKey: 'p' }),
    candidate('candidate', 9, 'q'), spawn('negative', 1, { weight: -1 }), spawn('fraction', 1, { weight: 0.2 }),
    spawn('badgroup', 1, { weight: 5, randomSpawnGroupKey: false }), spawn('badpack', 1, { weight: 5, randomSpawnGroupPackKey: {} })]
  const before = structuredClone(actions)
  assert.deepEqual([...analyze(actions).fixedWeightIndices], [0])
  assert.deepEqual(actions, before)
  assert.deepEqual([...getRandomSpawnPhaseResolution({ actions }, { ...context, sourceRevision: 'new' }, resolve).fixedWeightIndices], [])
  assert.deepEqual([...getRandomSpawnPhaseResolution({ actions }, { ...context, levelId: 'activities/act5bossrush/level_a' }, resolve).fixedWeightIndices], [])
  for (const levelId of ['activities/act1multi/level_act1multi_football', 'activities/act2vmulti/level_act2vmulti_tr02']) {
    assert.deepEqual([...getRandomSpawnPhaseResolution({ actions }, { ...context, levelId }, resolve).fixedWeightIndices], [])
    assert.deepEqual(getRandomSpawnPhaseResolution({ actions }, { ...context, levelId }, resolve).countedSpawns, [])
  }
})

test('uses enemy-wise minima across whole packs without summing alternatives', () => {
  const actions = [candidate('a', 2, 'p1'), spawn('a', 3, { randomSpawnGroupPackKey: 'p1' }),
    spawn('b', 4, { randomSpawnGroupPackKey: 'p1' }), candidate('b', 6, 'p2'),
    spawn('a', 3, { randomSpawnGroupPackKey: 'p2' }), spawn('c', 10, { randomSpawnGroupPackKey: 'p2' })]
  assert.deepEqual(counts(analyze(actions)), [['a', 3, 'g'], ['b', 4, 'g']])
  assert.equal(analyze(actions).groups[0].count, 7)
})

test('independent groups and repeated enemy actions add only their own common contribution', () => {
  const result = analyze([candidate('a', 3, null), candidate('a', 5, null),
    candidate('b', 8, null, { randomSpawnGroupKey: 'h' }), candidate('b', 6, null, { randomSpawnGroupKey: 'h' })])
  assert.deepEqual(counts(result), [['a', 3, 'g'], ['b', 6, 'h']])
})

test('a possible empty, different-enemy, conditional, or disabled outcome has zero common contribution', () => {
  for (const second of [candidate('other', 2, null), candidate('', 2, null),
    { ...candidate('a', 2, null), actionType: 'EMPTY' },
    { ...candidate('a', 2, null), actionType: 'ACTIVATE_PREDEFINED' },
    candidate('a', 2, null, { condition: true }), candidate('a', 2, null, { hiddenGroup: 'disabled' })]) {
    assert.deepEqual(counts(analyze([candidate('a', 4, null), second])), [])
  }
})

test('uses resolved enemy replacements and counts after environment checks', () => {
  assert.deepEqual(counts(analyze([candidate('before', 4, null, { replace: 'after' }), candidate('after', 3, null)])), [['after', 3, 'g']])
  assert.deepEqual(counts(analyze([candidate('a', 4, 'one'), spawn('a', 9, { randomSpawnGroupPackKey: 'one', hiddenGroup: 'disabled' }),
    candidate('a', 6, 'two')])), [['a', 4, 'g']])
})

test('shared pack keys fail closed within or between groups', () => {
  assert.deepEqual(counts(analyze([candidate('a', 4, 'p'), candidate('a', 5, 'p')])), [])
  assert.deepEqual(counts(analyze([candidate('a', 4, 'p'), candidate('a', 5, 'q'),
    candidate('a', 8, 'p', { randomSpawnGroupKey: 'h' }), candidate('a', 9, 'r', { randomSpawnGroupKey: 'h' })])), [])
})

test('includes zero-weight alternatives conservatively and rejects bad candidate weights', () => {
  assert.deepEqual(counts(analyze([candidate('a', 5, null), candidate('a', 2, null, { weight: 0 })])), [['a', 2, 'g']])
  for (const weight of [-1, 0.1, NaN, Infinity, '50']) assert.deepEqual(counts(analyze([candidate('a', 5, null), candidate('a', 2, null, { weight })])), [])
  assert.deepEqual(counts(analyze([candidate('a', 5, null, { weight: 0 }), candidate('a', 2, null, { weight: 0 })])), [])
  assert.deepEqual(counts(analyze([candidate('a', 5, null, { weight: null }), candidate('a', 2, null, { weight: undefined })])), [])
})

test('unknown callback outcomes give zero, and invalid or overflowing callback counts reject the group', () => {
  const phase = { actions: [candidate('a', 5, null), candidate('a', 7, null)] }
  assert.deepEqual(getRandomSpawnPhaseResolution(phase, context, () => ({ status: 'unknown' })).countedSpawns, [])
  for (const resolvedCount of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(getRandomSpawnPhaseResolution(phase, context, () => ({ status: 'included', resolvedEnemyId: 'a', resolvedCount })).countedSpawns, [])
  }
  assert.deepEqual(counts(analyze([candidate('a', Number.MAX_SAFE_INTEGER, 'p'), spawn('a', 1, { randomSpawnGroupPackKey: 'p' })])), [])
})

test('malformed phases and unsupported action groups do not produce a lower bound', () => {
  for (const phase of [null, {}, { actions: {} }, { actions: null }]) assert.deepEqual(getRandomSpawnPhaseResolution(phase, context, resolve).countedSpawns, [])
  assert.deepEqual(counts(analyze([candidate('a', 1, null), { ...candidate('a', 3, null), actionType: 'FUTURE_ACTION' }])), [])
  assert.deepEqual(counts(analyze([candidate('a', 1, 'p'), spawn('a', 9, { randomSpawnGroupPackKey: 'p', randomSpawnGroupKey: {} })])), [])
  for (const randomSpawnGroupKey of ['bonus', 'bonus_f']) assert.deepEqual(counts(analyze([
    candidate('a', 3, 'p', { randomSpawnGroupKey }), candidate('a', 7, 'q', { randomSpawnGroupKey }),
  ])), [])
})

test('expected mode weights mutually exclusive packs without changing the default minimum API', () => {
  const actions = [candidate('a', 2, 'p1', { weight: 1 }), spawn('a', 4, { randomSpawnGroupPackKey: 'p1' }),
    candidate('b', 8, 'p2', { weight: 3 }), spawn('a', 2, { randomSpawnGroupPackKey: 'p2' })]
  const before = structuredClone(actions), result = expected(actions)
  assert.deepEqual(counts(result), [['a', 2, 'g']])
  assert.deepEqual(expectedCounts(result), { a: 3, b: 6 })
  assert.equal(result.expectedGroups[0].count, 9)
  assert.deepEqual(result.expectedGroups[0].candidates.map(c => [c.weight, c.probability, c.knownCount]), [[1, 0.25, 6], [3, 0.75, 10]])
  assert.equal(analyze(actions).expectedSpawns, undefined)
  assert.deepEqual(actions, before)
  assert.ok(result.evidence.some(line => line.includes('epsilon')))
})

test('empty and unresolved alternatives keep their probability mass, including zero-weight candidates', () => {
  const result = expected([candidate('a', 4, null, { weight: 1 }), candidate('unknown', 100, null, { weight: 1, condition: true }),
    candidate('', 1, 'empty', { weight: 2 }), spawn('a', 80, { randomSpawnGroupPackKey: 'empty' }),
    candidate('zero', 900, null, { weight: 0 })])
  assert.deepEqual(expectedCounts(result), { a: 1 })
  assert.equal(result.expectedGroups[0].totalWeight, 4)
  assert.deepEqual(result.expectedGroups[0].candidates.map(c => c.probability), [0.25, 0.25, 0.5, 0])
})

test('selected activation packs count explicit spawn followers but no activation side effects', () => {
  const activation = { ...candidate('trap_a#1', 1, 'p1'), actionType: 'ACTIVATE_PREDEFINED' }
  const actions = [activation, spawn('a', 6, { randomSpawnGroupPackKey: 'p1' }), candidate('b', 4, 'p2')]
  assert.deepEqual(counts(analyze(actions)), [])
  assert.deepEqual(counts(expected(actions)), [])
  assert.deepEqual(expectedCounts(expected(actions)), { a: 3, b: 2 })
  assert.deepEqual(expectedCounts(expected([{ ...activation, key: '' }, ...actions.slice(1)])), { b: 2 })
})

test('expected counts respect replacement and wave/hidden eligibility from the shared resolver', () => {
  assert.deepEqual(expectedCounts(expected([candidate('before', 6, 'one', { replace: 'after' }),
    spawn('after', 6, { randomSpawnGroupPackKey: 'one', hiddenGroup: 'disabled' }), candidate('after', 2, 'two')])), { after: 4 })
  const resolver = action => action.key === 'later' ? { status: 'conditional', reasons: ['unsupported-wave-tag'] } : resolve(action)
  assert.deepEqual(expectedCounts(expected([candidate('early', 6, 'one'), spawn('later', 50, { randomSpawnGroupPackKey: 'one' }),
    candidate('early', 2, 'two')], resolver)), { early: 4 })
})

test('independent expected groups agree with enumeration of every joint outcome', () => {
  const actions = [candidate('a', 2, null, { weight: 1 }), candidate('b', 4, null, { weight: 3 }),
    candidate('a', 6, null, { weight: 2, randomSpawnGroupKey: 'h' }), candidate('b', 8, null, { weight: 3, randomSpawnGroupKey: 'h' })]
  const result = expected(actions), summed = new Map(), enumerated = { a: 0, b: 0 }
  for (const entry of result.expectedSpawns) summed.set(entry.enemyId, (summed.get(entry.enemyId) ?? 0) + entry.count)
  for (const x of actions.slice(0, 2)) for (const y of actions.slice(2)) {
    const probability = x.weight / 4 * y.weight / 5
    enumerated[x.key] += x.count * probability
    enumerated[y.key] += y.count * probability
  }
  for (const [id, amount] of summed) assert.ok(Math.abs(amount - enumerated[id]) < 1e-12)
})

test('expected mode keeps the reviewed scope, group exclusions, and numeric safety limits', () => {
  const actions = [candidate('a', 4, null), candidate('b', 6, null)]
  for (const override of [{ sourceRevision: 'new' }, { levelId: 'activities/act1multi/level_act1multi_football' },
    { levelId: 'activities/act2vmulti/level_act2vmulti_tr02' }, { levelId: 'main/level_main_01-01' }]) {
    assert.deepEqual(expected(actions, resolve, override).expectedSpawns, [])
  }
  for (const group of ['bonus', 'bonus_f']) assert.deepEqual(expected(actions.map(a => ({ ...a, randomSpawnGroupKey: group }))).expectedGroups, [])
  assert.deepEqual(expected([candidate('a', 1, 'same'), candidate('b', 1, 'same')]).expectedGroups, [])
  for (const weight of [-1, '50', NaN, Infinity, 0.5, 2 ** 24]) {
    assert.deepEqual(expected([candidate('a', 1, null, { weight }), candidate('b', 1, null)]).expectedGroups, [])
  }
  for (const resolvedCount of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(expected(actions, a => ({ status: 'included', resolvedEnemyId: a.key, resolvedCount })).expectedGroups, [])
  }
  assert.deepEqual(expected([candidate('a', Number.MAX_SAFE_INTEGER, 'p'), spawn('b', 1, { randomSpawnGroupPackKey: 'p' })]).expectedGroups, [])
  assert.deepEqual(expected([candidate('a', 1, null, { weight: 0 })]).expectedGroups, [])
})

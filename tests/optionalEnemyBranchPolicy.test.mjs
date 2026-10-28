import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { getOptionalBranchExclusions } from '../scripts/lib/optionalEnemyBranchPolicy.mjs'
import { analyzeEnemySpawns } from '../scripts/lib/enemySpawnConditions.mjs'

// DV-3 retains upstream bytes; additional fixtures preserve parsed source objects.
const fixtureBytes = gunzipSync(readFileSync(new URL('./fixtures/enemyBranchPolicy/dv3-level.json.gz', import.meta.url)))
const additional = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/enemyBranchPolicy/power-armor-levels.json.gz', import.meta.url))))
const dv3Id = 'activities/act19side/level_act19side_03'
const sourceRevision = '60e3aaf434919fbca931024a59d51088e810a9d3'
const fixtures = new Map([[dv3Id, JSON.parse(fixtureBytes)], ...additional.levels])
const source = (id = dv3Id) => structuredClone(fixtures.get(id))
const context = (levelId = dv3Id, difficulty = 'NORMAL') => ({ levelId, difficulty, diffGroup: 'NONE', sourceRevision })
const idFor = suffix => `activities/act19side/level_act19side_${suffix}`
const candidates = [
  ['03', 40, 3], ['04', 32, 3], ['05', 30, 3], ['06', 36, 4], ['07', 48, 6],
  ['ex02', 38, 8], ['ex03', 35, 5], ['ex05', 35, 7], ['ex06', 35, 6], ['ex07', 30, 5],
  ['sub-1-1', 32, 3], ['sub-1-2', 37, 2],
]

test('real fixtures retain the reviewed source revision and DV-3 upstream Git blob', () => {
  const blobHash = createHash('sha1').update(`blob ${fixtureBytes.length}\0`).update(fixtureBytes).digest('hex')
  assert.equal(blobHash, 'e5cdef057486aec90af04a4c99747121ea5b46aa')
  assert.equal(additional.sourceRevision, sourceRevision)
  assert.equal(fixtures.size, 17)
})

test('the shared mechanism resolves twelve applicable stages and every suit variant with per-action evidence', () => {
  const suitTypes = new Set()
  for (const [suffix, total, omitted] of candidates) {
    const id = idFor(suffix), level = source(id), before = structuredClone(level)
    const result = analyzeEnemySpawns(level, context(id))
    assert.deepEqual([...result.reasons], [], suffix)
    assert.equal([...result.counts.values()].reduce((sum, count) => sum + count, 0), total, suffix)
    assert.equal(result.omittedBranchSpawns.length, omitted, suffix)
    for (const exclusion of result.omittedBranchSpawns) {
      assert.equal(exclusion.ruleId, 'inactive-power-armor-v2')
      assert.match(exclusion.condition, /起動させずにクリア可能|選択中の難易度では起動前の装置が配置されない/)
      assert.ok(exclusion.evidence.length > 0)
      assert.ok(exclusion.evidence.some(entry => entry.includes(sourceRevision)))
      assert.equal(level.branches[exclusion.branchId].phases[exclusion.phaseIndex].actions[exclusion.actionIndex].key, exclusion.enemyId)
    }
    for (const token of level.predefines.tokenInsts) if (/^trap_07[5-8]_/.test(token.inst?.characterKey)) suitTypes.add(token.inst.characterKey)
    assert.deepEqual(level, before)
  }
  assert.deepEqual([...suitTypes].sort(), ['trap_075_bgarmn', 'trap_076_bgarms', 'trap_077_rmtarmn', 'trap_078_rmtarms'])
  const first = getOptionalBranchExclusions(source(), context())
  first[0].evidence.length = 0
  assert.ok(getOptionalBranchExclusions(source(), context())[0].evidence.length > 0)
})

test('normal and challenge environments resolve suits despite predefined activation changes', () => {
  for (const [suffix, total, omitted] of candidates.filter(([suffix]) => suffix.startsWith('ex'))) {
    for (const difficulty of ['NORMAL', 'FOUR_STAR']) {
      const id = idFor(suffix), result = analyzeEnemySpawns(source(id), context(id, difficulty))
      assert.deepEqual([...result.reasons], [], `${suffix}/${difficulty}`)
      assert.equal(result.omittedBranchSpawns.length, omitted)
      assert.equal([...result.counts.values()].reduce((sum, count) => sum + count, 0), total)
    }
  }
})

test('hidden suit placement follows selected difficulty and TOUGH resolves as FOUR_STAR', () => {
  const absent = entries => entries.filter(entry => entry.condition.includes('配置されない')).map(entry => entry.branchId).sort()
  for (const [suffix, normalAbsent, challengeAbsent] of [
    ['ex02', ['line_07', 'line_08'], []], ['ex03', ['line_05'], ['line_02']],
  ]) {
    const id = idFor(suffix), level = source(id)
    const normal = getOptionalBranchExclusions(level, context(id))
    const challenge = getOptionalBranchExclusions(level, context(id, 'FOUR_STAR'))
    const tough = getOptionalBranchExclusions(level, { ...context(id), diffGroup: 'TOUGH' })
    assert.deepEqual(absent(normal), normalAbsent)
    assert.deepEqual(absent(challenge), challengeAbsent)
    assert.deepEqual(tough, challenge)
  }
})

test('conflicting placement rules remain unresolved only when applicable to the selected difficulty', () => {
  const id = idFor('ex02'), level = source(id)
  const placement = structuredClone(level.runes.find(rune => rune.key === 'level_predefines_enable'))
  placement.blackboard = [{ key: 'trap_076_bgarms#7', value: 0, valueStr: null }]
  level.runes.push(placement)
  assert.equal(getOptionalBranchExclusions(level, context(id)).length, 8)
  assert.deepEqual(getOptionalBranchExclusions(level, context(id, 'FOUR_STAR')), [])
  assert.ok(analyzeEnemySpawns(level, context(id, 'FOUR_STAR')).reasons.has('branch-spawn'))
  placement.blackboard[0].value = 1
  assert.equal(getOptionalBranchExclusions(level, context(id, 'FOUR_STAR')).length, 8)
  for (const entry of [
    { key: 'unknown-device', value: 1, valueStr: null },
    { key: 'trap_076_bgarms#7', value: 2, valueStr: null },
  ]) {
    placement.blackboard = [entry]
    assert.deepEqual(getOptionalBranchExclusions(level, context(id, 'FOUR_STAR')), [])
  }
})

test('mechanism classification survives map renaming and harmless source changes', () => {
  const level = source()
  level.branches.renamed_branch = level.branches.line_01
  delete level.branches.line_01
  level.predefines.tokenInsts[0].overrideSkillBlackboard.find(entry => entry.key === 'branch_id').valueStr = 'renamed_branch'
  level.mapId = 'a-renamed-map'
  level.options.initialCost += 5
  level.options.maxLifePoint += 1
  level.mapData.tiles[0].heightType = level.mapData.tiles[0].heightType === 'LOWLAND' ? 'HIGHLAND' : 'LOWLAND'
  level.routes[0].startPosition.col += 1
  level.randomSeed += 1
  level.runes = []
  const exclusions = getOptionalBranchExclusions(level, { ...context(), levelId: 'activities/renamed/level_another_map' })
  assert.equal(exclusions.length, 3)
  assert.ok(exclusions.some(entry => entry.branchId === 'renamed_branch'))
  assert.ok(exclusions.every(entry => entry.ruleId === 'inactive-power-armor-v2'))
})

test('invalid level IDs, unverified revisions, difficulties and rune selections retain unresolved branches', () => {
  for (const selectedRuneIds of [undefined, []]) assert.equal(getOptionalBranchExclusions(source(), { ...context(), selectedRuneIds }).length, 3)
  const invalid = [
    undefined, null, {}, [],
    ...['https://evil.test', 'foo:bar', '/', 'foo//bar'].map(levelId => ({ ...context(), levelId })),
    { ...context(), difficulty: undefined }, { ...context(), difficulty: 'EASY' },
    { ...context(), difficulty: 'UNKNOWN' },
    { ...context(), diffGroup: 'UNKNOWN' }, { ...context(), sourceRevision: undefined },
    { ...context(), sourceRevision: 'f'.repeat(40) },
    ...[null, false, 0, '', {}, ['option'], [undefined], ['']].map(selectedRuneIds => ({ ...context(), selectedRuneIds })),
  ]
  for (const candidate of invalid) {
    assert.deepEqual(getOptionalBranchExclusions(source(), candidate), [], JSON.stringify(candidate))
    assert.ok(analyzeEnemySpawns(source(), candidate).reasons.has('branch-spawn'))
  }
})

test('boss activation, special predefined teams and arcade activation remain unresolved', () => {
  for (const id of [idFor('08'), idFor('ex08'), idFor('tr01'), 'activities/act1arcade/level_act1arcade_m4_03']) {
    const level = source(id)
    if (id.endsWith('tr01')) assert.equal(level.options.isTrainingLevel, false)
    assert.deepEqual(getOptionalBranchExclusions(level, context(id)), [], id)
    assert.ok(analyzeEnemySpawns(level, context(id)).reasons.has('branch-spawn'), id)
  }
})

test('unknown mechanics and malformed branch bindings cannot become omitted spawns', () => {
  const mutations = [
    level => { level.branches.line_01.phases[0].actions[0].count = 2 },
    level => { level.branches.line_01.phases[0].actions[0].key = 'enemy_other' },
    level => { level.branches.line_01.phases[0].actions[0].managedByScheduler = false },
    level => { level.branches.line_01.phases[0].actions[0].condition = 'runtime' },
    level => { level.branches.line_01.phases[0].actions[0].unknown = 'new-behavior' },
    level => { level.predefines.tokenInsts[0].overrideSkillBlackboard[0].valueStr = 'missing-branch' },
    level => { level.predefines.tokenInsts[0].overrideSkillBlackboard.push({ key: 'branch_id', value: 0, valueStr: 'line_02' }) },
    level => { level.predefines.tokenInsts[0].overrideSkillBlackboard.find(entry => entry.key === 'action_index').value = 1 },
    level => { level.predefines.tokenInsts[0].overrideSkillBlackboard.push({ key: 'init_sp', value: 100, valueStr: null }) },
    level => { level.predefines.tokenInsts[0].inst.characterKey = 'trap_086_larva' },
    level => { level.predefines.tokenInsts[0].skillIndex = 1 },
    level => { level.predefines.tokenInsts[0].overrideTalents = [{ key: 'force_activation' }] },
    level => { level.enemyDbRefs[0].id = 'enemy_other' },
    level => { level.runes = [{ key: 'unknown_mechanic', difficultyMask: 'ALL', blackboard: [] }] },
    level => { level.optionalRunes = { option: [] } },
    level => { level.globalBuffs = [{ prefabKey: 'force_activation' }] },
    level => { level.mapData.effects = [{ key: 'unreviewed-effect' }] },
    level => { level.mapData.tiles[0].effects = [{ key: 'unreviewed-effect' }] },
    level => { level.routes[0].activation = 'unreviewed-effect' },
    level => { level.extraRoutes[0].checkpoints[0].activation = 'unreviewed-effect' },
  ]
  for (const mutate of mutations) {
    const level = source()
    mutate(level)
    const result = analyzeEnemySpawns(level, context())
    assert.ok(result.reasons.has('branch-spawn'), String(mutate))
    assert.equal(result.omittedBranchSpawns.some(entry => entry.branchId === 'line_01'), false, String(mutate))
  }
  const extra = source()
  extra.branches.unbound = structuredClone(extra.branches.line_01)
  const result = analyzeEnemySpawns(extra, context())
  assert.ok(result.reasons.has('branch-spawn'))
  assert.equal(result.omittedBranchSpawns.some(entry => entry.branchId === 'unbound'), false)
})

test('omitting inactive suits preserves already active enemies in the main wave schedule', () => {
  const id = idFor('ex05'), level = source(id), baseline = analyzeEnemySpawns(level)
  const result = analyzeEnemySpawns(level, context(id))
  assert.deepEqual(result.actions, baseline.actions)
  assert.deepEqual(result.counts, baseline.counts)
  assert.equal(result.counts.get('enemy_1255_lybgpa_2'), 1)
  assert.equal(result.counts.get('enemy_1256_lyacpa_2'), 1)
  assert.equal(result.omittedBranchSpawns.length, 7)
  assert.deepEqual([...result.reasons], [])
})

test('object key order is irrelevant and malformed source gains no exclusions', () => {
  const reorder = value => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reorder(value[key])])) : value
  assert.equal(getOptionalBranchExclusions(reorder(source()), context()).length, 3)
  for (const level of [undefined, null, [], {}]) assert.deepEqual(getOptionalBranchExclusions(level, context()), [])
  assert.deepEqual(analyzeEnemySpawns(null, context()).omittedBranchSpawns, [])
})

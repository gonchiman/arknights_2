import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { getCooperateWaveResolution } from '../scripts/lib/cooperateWavePolicy.mjs'
import { analyzeEnemySpawns } from '../scripts/lib/enemySpawnConditions.mjs'
import { resolveEnemySpawnAggregation } from '../scripts/lib/enemySpawnAggregation.mjs'

// Complete, unmodified primary levels at the immutable reviewed JP revision.
const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/enemyBranchPolicy/cooperate-fortress-levels.json.gz', import.meta.url))))
const levels = new Map(fixture.levels)
const firstId = 'activities/act1multi/level_act1multi_fortress_02'
const raw = (id = firstId) => structuredClone(levels.get(id))
const context = (levelId = firstId) => ({ levelId, sourceRevision: fixture.sourceRevision, difficulty: 'NORMAL', diffGroup: 'NONE' })
const resolve = (source = raw(), ctx = context()) => getCooperateWaveResolution(source, ctx)
const action = (source, key) => {
  const [w, f, a] = key.split('/').map(Number)
  return source.waves[w].fragments[f].actions[a]
}
const total = (source, policy) => [...policy.actions.keys()].reduce((sum, key) => sum + action(source, key).count, 0)
const firstSpawn = source => source.waves[0].fragments[1].actions.find(a => a.actionType === 'SPAWN')

test('the shared first-wave policy resolves eight formerly empty Fortress lower bounds', () => {
  const expected = {
    act1multi_fortress_01: 19, act1multi_fortress_02: 29, act1multi_fortress_hard$01: 24,
    act1multi_fortress_rm01: 16, act1multi_tr03: 4,
    act2multi_fortress_01: 10, act2multi_fortress_02: 7, act2multi_fortress_rm01: 19,
    act2multi_fortress$hard$01: 21, act2multi_tr03: 4,
    act2vmulti_fortress: 16, act2vmulti_tr03: 4,
  }
  assert.equal(levels.size, 12)
  for (const [id, source] of levels) {
    const before = JSON.stringify(source), policy = resolve(source, context(id))
    const count = expected[id.split('/level_')[1].replaceAll('-', '$')]
    assert.equal(policy?.wavePolicyApplies, true, id)
    assert.equal(total(source, policy), count, id)
    assert.equal(policy.aggregationConditions.length, 1)
    assert.ok(policy.aggregationConditions[0].includes('下限'))
    for (const [key, result] of policy.actions) {
      assert.ok(key.startsWith('0/'), 'a later WAVE must never be included')
      assert.equal(action(source, key).actionType, 'SPAWN')
      assert.ok(result.evidence.some(line => line.includes(fixture.sourceRevision)))
      assert.ok(result.evidence.some(line => line.includes('GameAssembly.dll')))
      assert.ok(result.evidence.some(line => line.includes('timeout')))
    }
    assert.equal(JSON.stringify(source), before, 'source schedules and groups must not be rewritten')
  }
})

test('source, mode and context guards reject unreviewed controllers and Football', () => {
  for (const change of [
    { sourceRevision: undefined }, { sourceRevision: 'new-source' },
    { levelId: 'activities/act1multi/level_act1multi_football_01' },
    { levelId: 'activities/act3multi/level_act3multi_fortress_01' },
    { levelId: '../activities/act1multi/level_act1multi_fortress_02' },
    { difficulty: 'FOUR_STAR' }, { diffGroup: 'TOUGH' }, { diffGroup: 'EASY' },
    { selectedRuneIds: ['unknown-controller'] }, { selectedRuneIds: 'unknown' },
  ]) {
    const policy = resolve(raw(), { ...context(), ...change })
    assert.ok(policy === null || policy.actions.size === 0, JSON.stringify(change))
  }
  assert.equal(resolve(null), null)
  assert.equal(resolve(raw(), null), null)
  for (const mutate of [
    l => { l.globalBuffs[0].prefabKey = 'other-timeout-controller' },
    l => { l.globalBuffs.push({ prefabKey: 'skip-wave' }) },
    l => { l.predefines.tokenInsts[0].inst.characterKey = 'trap_unknown' },
    l => { l.predefines.tokenInsts[0].mainSkillLvl += 1 },
    l => { l.enemyDbRefs[0].overwrittenData = { prefabKey: { m_defined: true, m_value: 'unknown-skip-wave' } } },
    l => { l.enemyDbRefs[0].overwrittenData = { skills: [{ prefabKey: 'skip-wave' }] } },
    l => { l.runes.push({ key: 'skip-wave', difficultyMask: 'ALL' }) },
    l => { l.unknownWaveController = { skip: true } },
    l => { l.branches.newController = { phases: [{ actions: [{ actionType: 'TRIGGER_PREDEFINED', key: 'skip' }] }] } },
  ]) {
    const source = raw(); mutate(source)
    const policy = resolve(source)
    assert.equal(policy?.wavePolicyApplies, true, mutate.toString())
    assert.equal(policy.actions.size, 0, mutate.toString())
    assert.deepEqual(policy.aggregationConditions, [])
  }
})

test('ordinary counts and attributes are recalculated, not matched against a whole-map checksum', () => {
  const source = raw()
  firstSpawn(source).count = 4
  const policy = resolve(source)
  assert.equal(total(source, policy), 32)
  assert.equal(total(raw(), resolve()), 29)
  const id = 'activities/act1multi/level_act1multi_fortress_01', withOverride = raw(id)
  withOverride.enemyDbRefs.find(ref => ref.overwrittenData).overwrittenData.attributes.maxHp.m_value += 100
  assert.equal(total(withOverride, resolve(withOverride, context(id))), 19)
})

test('the current fragment is fully queued before a blocking enemy, but its successor is not guaranteed', () => {
  const source = raw()
  firstSpawn(source).blockFragment = true
  const policy = resolve(source)
  assert.equal(total(source, policy), 5)
  assert.ok([...policy.actions.keys()].every(key => key.startsWith('0/1/')))
  const rmId = 'activities/act1multi/level_act1multi_fortress_rm01'
  const rm = raw(rmId)
  assert.equal(firstSpawn(rm).blockFragment, true)
  assert.equal(total(rm, resolve(rm, context(rmId))), 16)
})

test('timeout comparison excludes the complete action when its last spawn is too late', () => {
  const source = raw(), spawn = firstSpawn(source)
  spawn.count = 2
  spawn.interval = 90
  const policy = resolve(source)
  assert.ok(!policy.actions.has('0/1/0'))
  assert.equal(total(source, policy), 4, 'later fragments also exceed the conservative time bound')
  for (const delay of [89, 90, 91]) {
    const delayed = raw(); firstSpawn(delayed).preDelay = delay
    assert.ok(!resolve(delayed).actions.has('0/1/0'), `deadline-near delay ${delay}`)
  }
})

test('a recognized timed schedule with no safe actions still defers all other waves', () => {
  for (const mutate of [
    l => { l.waves[0].preDelay = 1000 },
    l => { l.waves[0].advancedWaveTag = 'unknown-initial-tag' },
    l => { l.waves[0].maxTimeWaitingForNextWave = 10 },
    l => { l.waves[0].fragments[0].unknownCondition = 'wait' },
  ]) {
    const source = raw(); mutate(source)
    const policy = resolve(source)
    assert.equal(policy?.wavePolicyApplies, true, mutate.toString())
    assert.equal(policy.actions.size, 0, mutate.toString())
  }
})

test('an unresolved predefined trigger preserves only the earlier part of its fragment', () => {
  const id = 'activities/act2multi/level_act2multi_fortress_02'
  const source = raw(id), policy = resolve(source, context(id))
  assert.equal(total(source, policy), 7)
  assert.ok([...policy.actions.keys()].every(key => key.startsWith('0/1/')))
  assert.equal(source.waves[0].fragments[1].actions.find(a => a.actionType === 'TRIGGER_PREDEFINED').preDelay, 31)
  // Same-time ordering is not used as evidence; all occurrences must precede it.
  source.waves[0].fragments[1].actions[3].preDelay = 23
  const boundary = resolve(source, context(id))
  assert.equal(total(source, boundary), 4)
  assert.ok(!boundary.actions.has('0/1/3'))
})

test('the integration preserves independent hidden and random validation', () => {
  const source = raw(), spawn = firstSpawn(source)
  spawn.hiddenGroup = 'not-enabled'
  assert.ok(resolve(source).actions.has('0/1/0'), 'the helper only resolves WAVE timing')
  const analysis = analyzeEnemySpawns(source, context())
  const first = analysis.actions.find(a => a.waveIndex === 0 && a.fragmentIndex === 1 && a.actionIndex === 0)
  assert.notEqual(first.status, 'included', 'a timing proof must not enable a hidden group')
  spawn.hiddenGroup = null
  spawn.randomSpawnGroupKey = 'unknown-random-group'
  const random = analyzeEnemySpawns(source, context()).actions.find(a => a.waveIndex === 0 && a.fragmentIndex === 1 && a.actionIndex === 0)
  assert.notEqual(random.status, 'included', 'a timing proof must not bypass random selection')
})

test('the integration counts the first prefix only, including when later WAVE tags are blank', () => {
  for (const id of [
    'activities/act1multi/level_act1multi_fortress_01',
    'activities/act2multi/level_act2multi_fortress_01',
    'activities/act2multi/level_act2multi_fortress_02',
    'activities/act2multi/level_act2multi_fortress_rm01',
  ]) {
    const source = raw(id), ctx = context(id), policy = resolve(source, ctx)
    const analysis = analyzeEnemySpawns(source, ctx)
    assert.ok(analysis.actions.filter(a => a.waveIndex > 0).every(a => a.status !== 'included'), id)
    const result = resolveEnemySpawnAggregation(source, ctx, { mode: 'lower-bound', analysis })
    assert.equal(result.count ?? 0, total(source, policy), id)
  }
})

test('unreviewed controls or source contexts never restore legacy untagged-wave counts', () => {
  for (const id of [
    'activities/act1multi/level_act1multi_fortress_01',
    'activities/act2multi/level_act2multi_fortress_01',
    'activities/act2multi/level_act2multi_fortress_02',
    'activities/act2multi/level_act2multi_fortress_rm01',
  ]) for (const mutate of [
    (l, ctx) => { l.globalBuffs[0].prefabKey = 'unknown-wave-skip' },
    (l, ctx) => { l.runes.push({ key: 'unknown-controller', difficultyMask: 'ALL' }) },
    (l, ctx) => { ctx.sourceRevision = 'future-revision' },
    (l, ctx) => { ctx.selectedRuneIds = ['new-rune'] },
  ]) {
    const source = raw(id), ctx = context(id); mutate(source, ctx)
    const policy = resolve(source, ctx)
    assert.equal(policy?.wavePolicyApplies, true)
    assert.equal(policy.actions.size, 0)
    const analysis = analyzeEnemySpawns(source, ctx)
    assert.ok(analysis.actions.every(a => a.status !== 'included'), `${id} ${mutate}`)
    const result = resolveEnemySpawnAggregation(source, ctx, { mode: 'lower-bound', analysis })
    assert.equal(result.count ?? 0, 0)
  }
})

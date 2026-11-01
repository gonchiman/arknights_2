import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { getBossRushWaveResolution } from '../scripts/lib/bossRushSpawnPolicy.mjs'
import { analyzeEnemySpawns } from '../scripts/lib/enemySpawnConditions.mjs'
import { resolveEnemySpawnAggregation } from '../scripts/lib/enemySpawnAggregation.mjs'

// Unmodified JP primary levels at the reviewed immutable source revision.
// Native wave/control evidence is documented in bossRushSpawnPolicy.mjs.
const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/enemyBranchPolicy/bossrush-levels.json.gz', import.meta.url))))
const levels = new Map(fixture.levels)
const firstId = 'activities/act5bossrush/level_bossrush5_01'
const bonusId = 'activities/act6bossrush/level_bossrush6_02'
const conditions = ['全WAVEクリア', '抑制ユニットによる追加出現なし']
const raw = (id = firstId) => structuredClone(levels.get(id))
const context = (levelId = firstId) => ({ levelId, sourceRevision: fixture.sourceRevision, difficulty: 'NORMAL', diffGroup: 'NONE' })
const resolve = (level = raw(), ctx = context()) => getBossRushWaveResolution(level, ctx)
const firstSpawn = level => level.waves[0].fragments.flatMap(fragment => fragment.actions).find(action => action.actionType === 'SPAWN')
const controller = level => level.predefines.tokenInsts.find(unit => unit.inst.characterKey === 'trap_091_brctrl')
const bb = (key, value) => ({ key, value: typeof value === 'number' ? value : 0, valueStr: typeof value === 'string' ? value : null })
const rune = (key, group, mask = 'NORMAL') => ({ key, difficultyMask: mask, professionMask: 1023, buildableMask: 'ALL', blackboard: [bb('key', group)] })

test('all 18 reviewed TN layouts share the sequential full-clear policy with source evidence', () => {
  const expected = {
    '5_01': ['exact', 30], '5_ex01': ['exact', 30], '5_02': ['exact', 96], '5_ex02': ['exact', 96],
    '5_03': ['lower-bound', 49], '5_ex03': ['lower-bound', 49], '5_04': ['lower-bound', 74],
    '5_ex04': ['lower-bound', 74], '5_fin04': ['lower-bound', 74],
    '6_01': ['exact', 46], '6_ex01': ['exact', 46], '6_02': ['lower-bound', 84],
    '6_ex02': ['lower-bound', 84], '6_03': ['lower-bound', 49], '6_ex03': ['lower-bound', 49],
    '6_04': ['exact', 139], '6_ex04': ['exact', 139], '6_fin04': ['exact', 145],
  }
  assert.equal(levels.size, 18)
  for (const [id, source] of levels) {
    const before = JSON.stringify(source), ctx = context(id), policy = resolve(source, ctx)
    assert.deepEqual(policy?.aggregationConditions, conditions, id)
    const analysis = analyzeEnemySpawns(source, ctx)
    const result = resolveEnemySpawnAggregation(source, ctx, { mode: 'lower-bound', analysis })
    assert.deepEqual([result.kind, result.count], expected[id.split('level_bossrush')[1]], id)
    assert.deepEqual(analysis.aggregationConditions, conditions)
    assert.ok(!analysis.reasons.has('unsupported-wave-tag'))
    for (const action of analysis.actions) {
      for (const condition of conditions) assert.ok(action.conditions.includes(condition))
      assert.ok(!action.conditions.includes('固定'))
      assert.ok(action.evidence.some(line => line.includes(fixture.sourceRevision)))
      assert.ok(action.evidence.some(line => line.includes('GameAssembly.dll')))
    }
    assert.equal(JSON.stringify(source), before, 'analysis must not change hidden groups or source actions')
  }
})

test('bonus-wave sponsor drones remain five real SPAWNs, while unresolved additional branches stay lower-bound', () => {
  const source = raw(bonusId), ctx = context(bonusId), analysis = analyzeEnemySpawns(source, ctx)
  const bonus = analysis.actions.filter(action => source.waves[action.waveIndex].advancedWaveTag === 'bonuswave')
  assert.equal(bonus.reduce((sum, action) => sum + action.resolvedCount, 0), 5)
  assert.ok(bonus.every(action => action.resolvedEnemyId === 'enemy_1105_tyokai' && action.status === 'included'))
  assert.deepEqual([...analysis.reasons], ['branch-spawn'])
  assert.deepEqual(analysis.countedBranchSpawns, [])
  assert.equal(resolveEnemySpawnAggregation(source, ctx, { analysis }).kind, 'excluded')
  assert.equal(resolveEnemySpawnAggregation(source, ctx, { mode: 'lower-bound', analysis }).count, 84)
})

test('recognition requires reviewed source, TN family and unambiguous baseline context', () => {
  for (const change of [
    { sourceRevision: 'another-revision' }, { sourceRevision: undefined },
    { levelId: 'activities/other/level_bossrush5_01' }, { levelId: 'activities/act7bossrush/level_bossrush7_01' },
    { levelId: '../activities/act5bossrush/level_bossrush5_01' }, { difficulty: 'FOUR_STAR' },
    { diffGroup: 'TOUGH' }, { diffGroup: 'EASY' }, { selectedRuneIds: ['suppressor-unit'] },
  ]) assert.equal(resolve(raw(), { ...context(), ...change }), null, JSON.stringify(change))
  assert.equal(resolve(raw(), null), null)
  assert.equal(resolve(null), null)
})

test('counts and ordinary stat values are analyzed rather than gated by a whole-map hash', () => {
  const source = raw(), spawn = firstSpawn(source), before = spawn.count
  spawn.count += 7
  source.enemyDbRefs[0].overwrittenData.attributes.maxHp.m_value += 1000
  assert.ok(resolve(source))
  const analysis = analyzeEnemySpawns(source, context())
  assert.equal(analysis.reasons.size, 0)
  assert.equal([...analysis.counts.values()].reduce((sum, count) => sum + count, 0), 37)
  assert.equal(spawn.count, before + 7)
})

test('unknown tags, timed waves and altered controller sequences fail closed', () => {
  const changes = [
    l => { l.waves[0].advancedWaveTag = 'new-boss-wave' },
    l => { l.waves[0].maxTimeWaitingForNextWave = 30 },
    l => { l.waves[1].advancedWaveTag = 'bosswave' },
    l => { l.waves[0].fragments[0].actions.shift() },
    l => { l.waves[0].fragments[0].actions.push(structuredClone(l.waves[0].fragments[0].actions[0])) },
    l => { l.waves[0].fragments[0].actions[0].count = 2 },
    l => { l.waves[0].fragments[0].actions[0].hiddenGroup = 'optional-controller' },
    l => { l.waves[0].fragments[0].actions[0].dontBlockWave = true },
    l => { controller(l).mainSkillLvl = 2 },
    l => { controller(l).overrideSkillBlackboard.push(bb('repeat_wave', 2)) },
    l => { controller(l).overrideTalents = [{ prefabKey: 'unknown-wave-control' }] },
    l => { controller(l).hidden = false },
    l => { l.branches = { control: { phases: [{ preDelay: 0, actions: [structuredClone(l.waves[0].fragments[0].actions[0])] }] } } },
  ]
  for (const change of changes) {
    const source = raw(); change(source)
    assert.equal(resolve(source), null, change.toString())
    assert.equal(analyzeEnemySpawns(source, context()).aggregationConditions, undefined)
  }
})

test('new enemies, skip-capable replacement, prefab/skill overrides and unknown control sources fail closed', () => {
  const changes = [
    l => { firstSpawn(l).key = 'enemy_musnake' },
    l => { l.branches = { unknown: { phases: [{ preDelay: 0, actions: [{ actionType: 'SPAWN', key: 'enemy_unknown_skip_wave', count: 1 }] }] } } },
    l => { l.enemyDbRefs[0].id = 'enemy_musnake' },
    l => { l.enemyDbRefs[0].overwrittenData.prefabKey = { m_defined: true, m_value: 'enemy_musnake' } },
    l => { l.enemyDbRefs[0].overwrittenData.skills = [{ prefabKey: 'finish_and_skip' }] },
    l => { l.enemyDbRefs[0].overwrittenData.attributes.repeatWave = { m_defined: true, m_value: 1 } },
    l => { l.globalBuffs = [{ prefabKey: 'unknown_global_control' }] },
    l => { l.operaConfig = 'unknown_opera' },
    l => { l.waves[0].fragments[0].actions.push({ actionType: 'PLAY_OPERA', key: 'unknown_wave_skip' }) },
    l => { l.waves[0].fragments[0].actions.push({ actionType: 'DISPLAY_ENEMY_INFO', key: firstSpawn(l).key, unknownControlMode: 'new-control' }) },
    l => { l.predefines.tokenInsts.push({ ...structuredClone(controller(l)), alias: 'new_controller' }) },
    l => { l.optionalRunes = { suppressor: [rune('level_hidden_group_enable', 'extra')] } },
  ]
  for (const change of changes) { const source = raw(); change(source); assert.equal(resolve(source), null, change.toString()) }
})

test('hidden groups retain normal default-off and source enable/disable behavior', () => {
  for (const [runes, expected] of [
    [[], 30], [[rune('level_hidden_group_enable', 'extra')], 32],
    [[rune('level_hidden_group_enable', 'extra', 'FOUR_STAR')], 30],
    [[rune('level_hidden_group_disable', 'extra')], 30],
  ]) {
    const source = raw()
    source.runes = runes
    source.waves[0].fragments[0].actions.push({ ...structuredClone(firstSpawn(source)), count: 2, hiddenGroup: 'extra' })
    const before = JSON.stringify(source), analysis = analyzeEnemySpawns(source, context())
    assert.deepEqual(analysis.aggregationConditions, conditions)
    assert.equal(analysis.reasons.size, 0)
    assert.equal([...analysis.counts.values()].reduce((sum, count) => sum + count, 0), expected)
    assert.equal(JSON.stringify(source), before)
  }
})

test('random and runtime-conditional actions remain uncounted; malformed actions are not lower-bound exceptions', () => {
  for (const [extra, reason, kind] of [
    [{ randomSpawnGroupKey: 'random' }, 'random-spawn-group', 'lower-bound'],
    [{ condition: 'runtime_check' }, 'conditional-spawn:condition', 'lower-bound'],
    [{ count: -1 }, 'invalid-spawn-count', 'excluded'],
    [{ futureRepeat: 2 }, 'unsupported-spawn-field:futureRepeat', 'excluded'],
  ]) {
    const source = raw(), spawn = firstSpawn(source), original = spawn.count
    Object.assign(spawn, extra)
    const analysis = analyzeEnemySpawns(source, context())
    assert.deepEqual(analysis.aggregationConditions, conditions)
    assert.ok(analysis.reasons.has(reason))
    const aggregation = resolveEnemySpawnAggregation(source, context(), { mode: 'lower-bound', analysis })
    assert.equal(aggregation.kind, kind)
    if (kind === 'lower-bound') assert.equal(aggregation.count, 30 - original)
  }
})

test('conflicting hidden-group rules and enemy replacement uncertainty still prevent aggregation', () => {
  const source = raw()
  firstSpawn(source).hiddenGroup = 'extra'
  source.runes = [rune('level_hidden_group_enable', 'extra'), rune('level_hidden_group_disable', 'extra')]
  const analysis = analyzeEnemySpawns(source, context())
  assert.deepEqual(analysis.aggregationConditions, conditions)
  assert.ok(analysis.reasons.has('conflicting-hidden-group-rules'))
  assert.equal(resolveEnemySpawnAggregation(source, context(), { mode: 'lower-bound', analysis }).kind, 'excluded')
  const replacement = raw(), id = firstSpawn(replacement).key
  replacement.runes = replacement.enemyDbRefs.filter(ref => ref.id !== id).slice(0, 2).map(ref => ({
    ...rune('level_enemy_replace', id), blackboard: [bb('key', id), bb('value', ref.id)],
  }))
  const uncertain = analyzeEnemySpawns(replacement, context())
  assert.deepEqual(uncertain.aggregationConditions, conditions)
  assert.ok(uncertain.reasons.has('conflicting-enemy-replacement'))
  assert.equal(resolveEnemySpawnAggregation(replacement, context(), { mode: 'lower-bound', analysis: uncertain }).kind, 'excluded')
})

test('ordinary maps keep the prior result shape and unsupported arbitrary same-name tags', () => {
  const source = { enemyDbRefs: [{ id: 'enemy_a' }], waves: [{ fragments: [{ actions: [{ actionType: 'SPAWN', key: 'enemy_a', count: 4 }] }] }] }
  const plain = analyzeEnemySpawns(source)
  assert.deepEqual([...plain.counts], [['enemy_a', 4]])
  assert.deepEqual(plain.actions[0].conditions, ['固定'])
  assert.equal(Object.hasOwn(plain, 'aggregationConditions'), false)
  source.waves[0].advancedWaveTag = 'bosswave'
  const tagged = analyzeEnemySpawns(source, context())
  assert.ok(tagged.reasons.has('unsupported-wave-tag'))
  assert.equal(tagged.counts.size, 0)
  assert.equal(Object.hasOwn(tagged, 'aggregationConditions'), false)
})

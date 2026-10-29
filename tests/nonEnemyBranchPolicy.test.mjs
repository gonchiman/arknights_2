import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { MAIN_ENEMY_EXCLUSIONS, NON_ENEMY_UNIT_ROLES, ENEMY_UNIT_ROLE_SOURCE_REVISION,
  getNonEnemyUnitRole, getNonEnemyUnitRoleEvidence } from '../scripts/lib/enemyUnitRoles.mjs'
import { MAIN_ENEMY_EXCLUSIONS as legacyExclusions } from '../scripts/generate-main-enemy-trends.mjs'
import { getNonEnemyBranchExclusions, getVerifiedNonEnemyUnit } from '../scripts/lib/nonEnemyBranchPolicy.mjs'
import { buildEnemyHistogramCounts } from '../scripts/generateEnemyHistogramCounts.mjs'
import { buildMapDatabase } from '../scripts/generateMapDatabase.mjs'

const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/enemyBranchPolicy/non-enemy-roles.json.gz', import.meta.url))))
const maps = new Map(fixture.levels)
const railMap = 'obt/main/level_main_13-06'
const minerMap = 'obt/main/level_main_16-02'
const dragonMap = 'activities/act40side/level_act40side_01'
const marbleMap = 'activities/act44side/level_act44side_01'
const marbleVariantMap = 'activities/act44side/level_act44side_sp01'
const fireMap = 'activities/act38side/level_act38side_01'
const source = id => structuredClone(maps.get(id))
const context = levelId => ({ levelId, difficulty: 'NORMAL', diffGroup: 'NONE', sourceRevision: fixture.sourceRevision })
const defined = value => ({ m_defined: true, m_value: value })
const results = (id, value = source(id)) => getNonEnemyBranchExclusions(value, context(id))

test('main-trends retains its original 23 exclusions through the shared role registry', () => {
  assert.equal(legacyExclusions, MAIN_ENEMY_EXCLUSIONS)
  assert.equal(Object.keys(legacyExclusions).length, 23)
  assert.equal(Object.keys(NON_ENEMY_UNIT_ROLES).length, 27)
  assert.equal(getNonEnemyUnitRole('enemy_1369_bmbcar1'), 'neutral-rail-bomb')
  assert.equal(getNonEnemyUnitRole('enemy_3010_mcreep'), 'allied-miner')
  for (const id of ['unknown', '__proto__', 'constructor', null]) assert.equal(getNonEnemyUnitRole(id), null)
})

test('source evidence identifies neutral bombs, allied miners and the reviewed environmental actors', () => {
  assert.equal(fixture.sourceRevision, ENEMY_UNIT_ROLE_SOURCE_REVISION)
  const ability = id => fixture.handbook[id].abilityList.map(item => item.text).join(' ')
  assert.match(ability('enemy_1369_bmbcar1'), /中立ユニット/)
  assert.match(ability('enemy_3010_mcreep'), /味方ユニット/)
  for (const id of ['enemy_10061_cjglon', 'enemy_10062_cjblon']) {
    assert.match(ability(id), /攻撃対象にならず、殲滅数にはカウントされない/)
    assert.match(ability(id), /退場時に耐久値が減少しない/)
  }
  assert.match(fixture.skill.levels[0].description, /「ある種の天命」を発射し続ける/)
  assert.equal(fixture.marblePassive.eventToActions.ON_TAKE_DAMAGE[0]._reason, 'UNHURTABLE')
  assert.match(fixture.marblePassive.eventToActions.ON_TAKE_DAMAGE[0].$type, /CancelModifier/)
})

test('real branches are classified by actor identity without changing their source or normal waves', () => {
  const expected = new Map([
    [railMap, ['enemy_1369_bmbcar1']], [minerMap, ['enemy_3010_mcreep']],
    [dragonMap, ['enemy_10061_cjglon', 'enemy_10062_cjblon']], [marbleMap, ['enemy_10111_ymgpck']],
    [marbleVariantMap, ['enemy_10111_ymgpck_2']],
  ])
  for (const [id, enemies] of expected) {
    const level = source(id), before = structuredClone(level)
    const entries = results(id, level)
    assert.deepEqual([...new Set(entries.map(item => item.enemyId))].sort(), enemies.sort(), id)
    for (const entry of entries) {
      assert.equal(level.branches[entry.branchId].phases[entry.phaseIndex].actions[entry.actionIndex].key, entry.enemyId)
      assert.equal(entry.ruleId, 'known-non-enemy-unit-v1')
      assert.ok(entry.evidence.some(text => text.includes(fixture.sourceRevision)))
      assert.ok(entry.evidence.some(text => text.includes(`levels/${id}.json`)))
    }
    assert.deepEqual(level, before)
  }
  assert.deepEqual(results(fireMap), [])
  const first = results(railMap)
  first[0].evidence.length = 0
  assert.ok(results(railMap)[0].evidence.length > 0)
})

test('HI02 is a separately reviewed marble with shared role evidence and different collision mechanics', () => {
  const originalId = 'enemy_10111_ymgpck', variantId = 'enemy_10111_ymgpck_2'
  const original = fixture.database[originalId][0].enemyData
  const variant = fixture.database[variantId][0].enemyData
  assert.equal(fixture.handbook[variantId].enemyIndex, 'HI02')
  assert.deepEqual(fixture.handbook[variantId].abilityList, fixture.handbook[originalId].abilityList)
  assert.deepEqual(variant.attributes, original.attributes)
  assert.equal(variant.prefabKey.m_value, variantId)
  const talent = (data, key) => data.talentBlackboard.find(entry => entry.key === key)
  assert.equal(talent(original, 'PushEnemy.angle').value, 30)
  assert.equal(talent(variant, 'PushEnemy.angle').value, 0)
  assert.equal(talent(variant, 'PushEnemy.delta_force').valueStr, '5|5|5|5|5|5|5')
  assert.equal(talent(variant, 'PushEnemy.hit_count_duration').value, 3)
  const condition = fixture.marbleEffect.eventToActions.ON_BUFF_START[0]._conditionNode
  assert.match(condition.$type, /CheckEnemyId/)
  assert.deepEqual(condition._filterIds, [variantId])
  const entries = results(marbleVariantMap)
  assert.equal(entries.length, 2)
  assert.ok(entries.every(entry => entry.enemyId === variantId && entry.condition === '敵以外のユニット（環境）'))
  assert.ok(entries.every(entry => entry.evidence.some(text => text.includes('別prefab'))))
  const changed = source(marbleVariantMap)
  changed.enemyDbRefs.find(ref => ref.id === variantId).overwrittenData = { prefabKey: defined(originalId) }
  assert.deepEqual(results(marbleVariantMap, changed), [])
})

test('known roles apply to new branch names and positions, not a map allowlist', () => {
  const level = source(railMap), entry = results(railMap)[0]
  const action = level.branches[entry.branchId].phases[entry.phaseIndex].actions[entry.actionIndex]
  level.branches = { new_branch: { phases: [{ actions: [] }, { actions: [{ actionType: 'WAIT' }, action] }] } }
  const entries = getNonEnemyBranchExclusions(level, context('activities/new/level_new_01'))
  assert.equal(entries.length, 1)
  assert.deepEqual([entries[0].branchId, entries[0].phaseIndex, entries[0].actionIndex], ['new_branch', 1, 1])
})

test('an enemy ID with missing, duplicate, custom or changed database data remains unresolved', () => {
  const mutations = [
    level => { level.enemyDbRefs = level.enemyDbRefs.filter(ref => ref.id !== 'enemy_1369_bmbcar1') },
    level => { level.enemyDbRefs.push(structuredClone(level.enemyDbRefs.find(ref => ref.id === 'enemy_1369_bmbcar1'))) },
    level => { level.enemyDbRefs.find(ref => ref.id === 'enemy_1369_bmbcar1').useDb = false },
    level => { level.enemyDbRefs.find(ref => ref.id === 'enemy_1369_bmbcar1').level = 1 },
    ...[
      { prefabKey: defined('enemy_1001_bear') },
      { attributes: { atk: defined(0) }, notCountInTotal: defined(true) },
      { talentBlackboard: defined([]) }, { skills: defined([]) }, { futureRole: true },
    ].map(overwrittenData => level => { level.enemyDbRefs.find(ref => ref.id === 'enemy_1369_bmbcar1').overwrittenData = overwrittenData }),
  ]
  for (const mutate of mutations) {
    const level = source(railMap)
    mutate(level)
    assert.deepEqual(results(railMap, level), [], String(mutate))
  }
})

test('inactive wrappers and the marble’s exact database values preserve the reviewed identity', () => {
  const level = source(railMap)
  level.enemyDbRefs.find(ref => ref.id === 'enemy_1369_bmbcar1').overwrittenData = {
    prefabKey: { m_defined: false, m_value: 'another_enemy' },
    attributes: { atk: { m_defined: false, m_value: 9999 }, groundBoundImmune: null }, skills: null,
  }
  assert.ok(results(railMap, level).length > 0)
  const marble = source(marbleMap), ref = marble.enemyDbRefs.find(ref => ref.id === 'enemy_10111_ymgpck')
  ref.overwrittenData = { attributes: { moveSpeed: defined(3.5), massLevel: defined(5) } }
  assert.ok(results(marbleMap, marble).length > 0)
  ref.overwrittenData.attributes.massLevel = defined(6)
  assert.deepEqual(results(marbleMap, marble), [])
})

test('replacement or ability overrides do not reuse the original actor’s role', () => {
  const enemyId = 'enemy_1369_bmbcar1'
  for (const rune of [
    { key: 'level_enemy_replace', difficultyMask: 'ALL', blackboard: [{ key: 'key', valueStr: enemyId }, { key: 'value', valueStr: 'enemy_1001_bear' }] },
    { key: 'enemy_dynamic_ability_new', difficultyMask: 'ALL', blackboard: [{ key: 'enemy', valueStr: enemyId }, { key: 'key', valueStr: 'new_role' }] },
    { key: 'enemy_talent_blackb_add', difficultyMask: 'ALL', blackboard: [] },
  ]) {
    const level = source(railMap)
    level.runes.push(rune)
    assert.deepEqual(results(railMap, level), [])
    level.runes.pop()
    level.optionalRunes = { optional: [rune] }
    assert.deepEqual(results(railMap, level), [])
  }
})

test('zero ATK, hidden or non-kill-count flags do not turn an unreviewed actor into a non-enemy', () => {
  const level = source(railMap)
  level.enemyDbRefs = [{ id: 'enemy_unknown', level: 0, useDb: true,
    overwrittenData: { attributes: { atk: defined(0) }, notCountInTotal: defined(true), lifePointReduce: defined(0) } }]
  level.branches = { unknown: { phases: [{ actions: [{ actionType: 'SPAWN', key: 'enemy_unknown', count: 1,
    isUnharmfulAndAlwaysCountAsKilled: true, hiddenGroup: 'hidden' }] }] } }
  assert.deepEqual(results(railMap, level), [])
  assert.deepEqual(getNonEnemyUnitRoleEvidence('enemy_unknown'), [])
})

test('unreviewed provenance and malformed branch input are held without throwing', () => {
  assert.deepEqual(getNonEnemyBranchExclusions(source(railMap)), [])
  assert.deepEqual(getNonEnemyBranchExclusions(source(railMap), { ...context(railMap), sourceRevision: 'future' }), [])
  assert.deepEqual(getNonEnemyBranchExclusions(source(railMap), { ...context(railMap), levelId: '../outside' }), [])
  for (const branches of [null, [], { x: { phases: {} } }, { x: { phases: [{ actions: {} }] } }]) {
    assert.deepEqual(results(railMap, { ...source(railMap), branches }), [])
  }
})

test('the reviewed miner HP-loss override preserves its role but arbitrary talent changes do not', () => {
  const id = 'obt/main/level_main_16-08', enemyId = 'enemy_3010_mcreep'
  const level = structuredClone(new Map(fixture.minerWaveLevels).get(id))
  const damage = fixture.minerFearBlood.eventToActions.ON_BUFF_TRIGGER.find(node => /FixedValueDamage/.test(node.$type))
  assert.equal(damage._damageKey, 'value')
  const verified = getVerifiedNonEnemyUnit(level, context(id), enemyId)
  assert.equal(verified.role, 'allied-miner')
  assert.ok(verified.evidence.some(text => text.includes('FearLoseBlood.value=0')))
  level.enemyDbRefs.find(ref => ref.id === enemyId).overwrittenData.talentBlackboard[0].key = 'NewAllegiance.value'
  assert.equal(getVerifiedNonEnemyUnit(level, context(id), enemyId), null)
})

test('V3 excludes 157 prior and 42 newly admitted normal-wave miners only from histogram SPAWNS', () => {
  const levels = structuredClone(fixture.minerWaveLevels).map(([levelId, data]) => ({ levelId, data }))
  const before = JSON.stringify(levels), enemyId = 'enemy_3010_mcreep'
  const stageContexts = new Map(fixture.minerWaveContexts)
  const old = buildEnemyHistogramCounts(levels, { stageContexts })
  const current = buildEnemyHistogramCounts(levels, { stageContexts, sourceRevision: fixture.sourceRevision })
  assert.equal(old.enemies[enemyId].spawnCount, 157)
  assert.equal(current.enemies[enemyId].spawnCount, 0)
  assert.equal(current.enemies[enemyId].mapCount, 13)
  assert.equal(current.enemies[enemyId].mapCount, old.enemies[enemyId].mapCount)
  assert.equal(current.summary.spawnMapCount - old.summary.spawnMapCount, 4)
  const excluded = current.diagnostics.excludedNonEnemySpawns.filter(entry => entry.enemyId === enemyId)
  assert.equal(excluded.reduce((sum, entry) => sum + entry.count, 0), 199)
  const newMapIds = ['obt/main/level_main_16-05', 'obt/main/level_main_16-06',
    'obt/main/level_main_16-12', 'obt/training/level_training_27']
  assert.deepEqual(excluded.filter(entry => newMapIds.includes(entry.levelId)).map(entry => entry.count), [3, 10, 26, 3])
  assert.equal(excluded.filter(entry => !newMapIds.includes(entry.levelId)).reduce((sum, entry) => sum + entry.count, 0), 157)
  assert.ok(excluded.every(entry => entry.ruleId === 'known-non-enemy-unit-v1' && entry.evidence.length > 0))
  const maps = buildMapDatabase({ stageTable: { stages: fixture.minerStages }, zoneTable: { zones: fixture.minerZones },
    handbook: { enemyData: fixture.handbook }, database: fixture.database, levels, sourceRevision: fixture.sourceRevision })
  for (const entry of excluded) {
    const map = maps.index.maps.find(map => map.levelId === entry.levelId)
    const detail = maps.details[map.detailFile].maps[entry.levelId]
    assert.equal(map.status, 'supported')
    assert.equal(detail.enemies.find(enemy => enemy.id === enemyId).count, entry.count)
    assert.equal(map.enemySpawnCounts[enemyId], entry.count)
  }
  assert.equal(JSON.stringify(levels), before)
  // Calling the legacy path again must not inherit current-policy mutations.
  assert.deepEqual(buildEnemyHistogramCounts(levels, { stageContexts }), old)
  assert.deepEqual(buildEnemyHistogramCounts(levels, { stageContexts, sourceRevision: 'unreviewed-revision' }), old)
  assert.equal(old.diagnostics.excludedNonEnemySpawns, undefined)
})

test('unknown role overrides retain the legacy histogram contribution and explain why', () => {
  const levelId = 'activities/act20mini/level_act20mini_03', enemyId = 'enemy_3010_mcreep'
  for (const override of [
    { prefabKey: defined('enemy_1001_bear') }, { talentBlackboard: [{ key: 'NewAllegiance.value', value: 1, valueStr: null }] },
  ]) {
    const data = structuredClone(new Map(fixture.minerWaveLevels).get(levelId))
    data.enemyDbRefs.find(ref => ref.id === enemyId).overwrittenData = override
    const result = buildEnemyHistogramCounts([{ levelId, data }], {
      sourceRevision: fixture.sourceRevision, stageContexts: { [levelId]: context(levelId) },
    })
    assert.equal(result.enemies[enemyId].spawnCount, 3)
    assert.equal(result.summary.spawnMapCount, 1)
    assert.equal(result.diagnostics.excludedNonEnemySpawns, undefined)
    assert.deepEqual(result.diagnostics.unverifiedNonEnemySpawns, [{ levelId, enemyId, count: 3,
      reason: 'unverified-reference-or-override', condition: '参照・上書きから役割を確定できないため、従来の出現数を維持' }])
  }
})

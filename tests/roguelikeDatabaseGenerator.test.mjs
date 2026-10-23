import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRoguelikeDatabase, selectRoguelikeStages } from '../scripts/generateRoguelikeDatabase.mjs'

const revision = '1234567890123456789012345678901234567890'
const stage = (id, overrides = {}) => ({ id, name: '死刑囚の夜', levelId: 'Obt/Roguelike/RO3/level_rogue3_1-1',
  linkedStageId: '', levelReplaceIds: {}, isElite: 0, isBoss: 0, difficulty: 'NORMAL', ...overrides })
const topicTable = (stages) => ({ topics: { rogue_3: { id: 'rogue_3', name: '探索者と銀氷の果て', sort: 3 } },
  details: { rogue_3: { stages } } })
const enemy = (name, hp) => [{ level: 0, enemyData: { name: { m_defined: true, m_value: name },
  attributes: { maxHp: { m_defined: true, m_value: hp }, magicResistance: { m_defined: true, m_value: 0 } } } }]
const sourceLevel = (actions = []) => ({ mapData: { map: [[0, 1]], tiles: [
  { tileKey: 'tile_start', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
  { tileKey: 'tile_end', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
] }, enemyDbRefs: [{ id: 'enemy_a' }, { id: 'enemy_b' }],
options: { maxLifePoint: 3, initialCost: 10, characterLimit: 6 },
waves: [{ preDelay: 0, fragments: [{ preDelay: 2, actions }] }], routes: [{ startPosition: { row: 0, col: 0 } }] })
const spawn = (key, count, extra = {}) => ({ actionType: 'SPAWN', key, count, preDelay: 0, interval: 1, routeIndex: 0, ...extra })
const input = (stages, levels = []) => ({ topicTable: topicTable(stages), levels, revision,
  handbook: { enemyData: { enemy_a: { name: '一般囚人' } } }, database: { enemy_a: enemy('囚人', 5500), enemy_b: enemy('重罪囚人', 7500) },
  generatedAt: '2026-10-23T00:00:00Z' })

test('normal and emergency retain their own IDs and share a single physical level', () => {
  const output = buildRoguelikeDatabase(input({
    normal: stage('ro3_n_1_1'),
    emergency: stage('ro3_e_1_1', { isElite: 1, linkedStageId: 'ro3_n_1_1', difficulty: 'FOUR_STAR', eliteDesc: '<@rolv.rem>敵が強化される</>' }),
  }, [{ levelId: 'obt/roguelike/ro3/level_rogue3_1-1', data: sourceLevel([spawn('enemy_a', 5)]) }]))
  assert.equal(output.index.maps.length, 1)
  assert.equal(output.index.maps[0].stageId, 'ro3_n_1_1')
  assert.deepEqual(output.index.stages.map(({ id, isEmergency, linkedStageId }) => ({ id, isEmergency, linkedStageId })), [
    { id: 'ro3_e_1_1', isEmergency: true, linkedStageId: 'ro3_n_1_1' },
    { id: 'ro3_n_1_1', isEmergency: false, linkedStageId: null },
  ])
  assert.equal(output.index.stages[0].eliteDescription, '敵が強化される')
  assert.equal(Object.values(output.details).flatMap((shard) => Object.keys(shard.maps)).length, 1)
  assert.equal(output.index.enemies.enemy_a.name, '一般囚人')
  assert.equal(output.index.enemies.enemy_a.hp, 5500)
  assert.equal(output.index.enemies.enemy_b.hp, 7500)
  assert.equal(output.index.source.commit, revision)
})

test('shared wave data never claims normal-mode enemy replacements or totals resolve emergency play', () => {
  const data = sourceLevel([spawn('enemy_a', 5), spawn('enemy_b', 1, { hiddenGroup: 'relic' }), spawn('enemy_a', 0)])
  data.runes = [{ key: 'level_enemy_replace', difficultyMask: 'FOUR_STAR', professionMask: 1023, buildableMask: 'ALL',
    blackboard: [{ key: 'key', valueStr: 'enemy_a' }, { key: 'value', valueStr: 'enemy_b' }] }]
  const output = buildRoguelikeDatabase(input({ normal: stage('normal') }, [
    { levelId: 'obt/roguelike/ro3/level_rogue3_1-1', data },
  ]))
  const summary = output.index.maps[0], detail = output.details[summary.detailFile].maps[summary.levelId]
  assert.equal(summary.spawnCount, null)
  assert.equal(summary.status, 'excluded')
  assert.ok(summary.reasons.includes('roguelike-context-unspecified'))
  assert.deepEqual(detail.enemies, [{ id: 'enemy_a', count: null }, { id: 'enemy_b', count: null }])
  const actions = detail.waves[0].fragments[0].actions
  assert.deepEqual(actions.map(({ count }) => count), [5, 1, 0])
  assert.deepEqual(actions.map(({ resolution }) => [resolution.status, resolution.resolvedCount]), [
    ['unknown', null], ['unknown', null], ['excluded', 0],
  ])
  assert.equal(actions[0].resolution.resolvedEnemyId, 'enemy_a')
  assert.equal(actions[1].hiddenGroup, 'relic')
  assert.deepEqual(summary.enemySpawnCounts, { enemy_a: 5, enemy_b: 1 }) // Raw settings, never a resolved total.
})

test('weighted alternatives are retained without adding them into a factual total', () => {
  const output = buildRoguelikeDatabase(input({ normal: stage('normal') }, [
    { levelId: 'obt/roguelike/ro3/level_rogue3_1-1', data: sourceLevel([
      spawn('enemy_a', 1, { randomSpawnGroupKey: 'g1', weight: 30 }),
      spawn('enemy_b', 1, { randomSpawnGroupKey: 'g1', weight: 10 }),
    ]) },
  ]))
  const summary = output.index.maps[0]
  const actions = output.details[summary.detailFile].maps[summary.levelId].waves[0].fragments[0].actions
  assert.equal(summary.spawnCount, null)
  assert.equal(actions.length, 2)
  assert.ok(actions.every((action) => action.randomSpawnGroupKey === 'g1' && action.spawnKind === 'conditional'
    && action.resolution.resolvedCount === null))
})

test('replacement maps are separate selectable geometry and missing files remain explicit', () => {
  const output = buildRoguelikeDatabase(input({ normal: stage('normal', {
    levelReplaceIds: ['Obt/Roguelike/RO3/replacement.json', 'Obt/Roguelike/RO3/missing'],
  }) }, [{ levelId: 'obt/roguelike/ro3/replacement', data: sourceLevel() }]))
  assert.equal(output.index.maps.length, 3)
  assert.deepEqual(output.index.stages[0].replacementLevelIds, ['obt/roguelike/ro3/replacement', 'obt/roguelike/ro3/missing'])
  assert.deepEqual(output.index.maps.filter((map) => map.status === 'missing').map(({ detailFile, spawnCount }) => [detailFile, spawnCount]), [
    [null, null], [null, null],
  ])
})

test('source blank placeholder names use their stage ID without dropping a record', () => {
  const selected = selectRoguelikeStages(topicTable({ blank: stage('ro4_b_9', { name: ' ' }) }))
  assert.equal(selected.stages[0].name, 'ro4_b_9')
})

test('invalid paths and unresolved cross-theme links fail generation instead of silently losing stages', () => {
  assert.throws(() => selectRoguelikeStages(topicTable({ bad: stage('bad', { levelId: '../secret' }) })), /Invalid stage/)
  assert.throws(() => selectRoguelikeStages(topicTable({ bad: stage('bad', { levelReplaceIds: ['a/../b'] }) })), /Invalid replacement/)
  assert.throws(() => selectRoguelikeStages(topicTable({ bad: stage('bad', { linkedStageId: 'absent' }) })), /Missing linked stage/)
  assert.throws(() => buildRoguelikeDatabase({ ...input({ normal: stage('normal') }), revision: 'master' }), /immutable/)
})

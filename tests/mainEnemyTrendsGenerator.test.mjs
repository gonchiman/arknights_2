import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMainEnemyTrends, resolveMainEnemyReference, selectMainEnemyTrendMaps } from '../scripts/generate-main-enemy-trends.mjs'

const defined = (value, flag = true) => ({ m_defined: flag, m_value: value })
const baseEnemy = (extra = {}) => ({ name: defined('兵士'), levelType: defined('NORMAL'),
  attributes: { maxHp: defined(100), atk: defined(20), def: defined(10), magicResistance: defined(0) }, ...extra })
const stage = (levelId, extra = {}) => ({ stageId: 'main_00-01', levelId, stageType: 'MAIN', isStoryOnly: false,
  appearanceStyle: 'MAIN_NORMAL', difficulty: 'NORMAL', diffGroup: 'NONE', ...extra })
const map = (extra = {}) => ({ stageId: 'main_00-01', levelId: 'obt/main/level_main_00-01', code: '0-1', name: '始まり',
  zoneName: '序章', status: 'supported', reasons: [], enemySpawnCounts: { a: 3 }, spawnCount: 3, ...extra })
function options(extra = {}) {
  return { mapIndex: { generatedAt: '2026-10-08T00:00:00Z', maps: [map()] },
    stageTable: { stages: { 'main_00-01': stage('obt/main/level_main_00-01') } },
    handbook: { enemyData: {} }, database: { a: [{ level: 0, enemyData: baseEnemy() }] },
    levels: new Map([['obt/main/level_main_00-01', { enemyDbRefs: [{ id: 'a', level: 0, useDb: true }],
      waves: [{ fragments: [{ actions: [{ actionType: 'SPAWN', key: 'a', count: 3 }] }] }] }]]),
    generatedAt: '2026-10-08T00:00:00Z', ...extra }
}

test('指定levelと上書きは定義済みフィールドだけを合成し、DBの元オブジェクトを変更しない', () => {
  const database = { a: [{ level: 0, enemyData: baseEnemy() },
    { level: 1, enemyData: { attributes: { maxHp: defined(300), def: defined(0, false) } } }] }
  const original = structuredClone(database)
  const resolved = resolveMainEnemyReference({ id: 'a', useDb: true, level: 1,
    overwrittenData: { attributes: { maxHp: defined(400), atk: defined(0), def: defined(999, false) } } }, database)
  assert.deepEqual(resolved.attributes, { maxHp: 400, atk: 0, def: 10, magicResistance: 0 })
  assert.deepEqual(database, original)
  assert.throws(() => resolveMainEnemyReference({ id: 'a', useDb: true, level: 2 }, database), /Missing enemy DB level/)
})

test('useDb:falseの自前敵は上書きだけで解決し、未定義ステータスを0で埋めない', () => {
  const resolved = resolveMainEnemyReference({ id: 'custom', useDb: false, level: 0,
    overwrittenData: { name: defined('自前敵'), attributes: { maxHp: defined(600), def: defined(0, false) } } }, {})
  assert.deepEqual(resolved, { name: '自前敵', attributes: { maxHp: 600 } })
})

test('物語・強襲・厄難・H作戦は除き、標準の表示コードとメインライン活動を保持する', () => {
  const maps = [map(), map({ stageId: 'story' }), map({ stageId: 'challenge' }), map({ stageId: 'tough' }),
    map({ stageId: 'h', levelId: 'obt/main/level_hard_00-01' }),
    map({ stageId: 'chapter15', levelId: 'obt/main/level_main_15-01', zoneId: 'act2mainss_zone1', code: '15-2' })]
  const stages = { 'main_00-01': stage(maps[0].levelId), story: stage(maps[1].levelId, { isStoryOnly: true }),
    challenge: stage(maps[2].levelId, { difficulty: 'FOUR_STAR' }), tough: stage(maps[3].levelId, { diffGroup: 'TOUGH' }),
    h: stage(maps[4].levelId), chapter15: stage(maps[5].levelId) }
  const selected = selectMainEnemyTrendMaps({ maps }, { stages })
  assert.deepEqual(selected.map((item) => [item.chapter, item.code]), [[0, '0-1'], [15, '15-2']])
})

test('元レベル未取得と非敵のみのマップを残してカバー率を正確に数える', () => {
  const input = options()
  input.mapIndex.maps.push(map({ stageId: 'main_00-02', levelId: 'obt/main/level_main_00-02', status: 'excluded', reasons: ['branch-spawn'] }))
  input.stageTable.stages['main_00-02'] = stage('obt/main/level_main_00-02')
  input.mapIndex.maps[0].enemySpawnCounts = { enemy_3001_upeopl: 3 }
  input.levels.set('obt/main/level_main_00-01', { enemyDbRefs: [{ id: 'enemy_3001_upeopl' }],
    waves: [{ fragments: [{ actions: [{ actionType: 'SPAWN', key: 'enemy_3001_upeopl', count: 3 }] }] }] })
  const data = buildMainEnemyTrends(input)
  assert.equal(data.summary.eligibleMapCount, 2)
  assert.equal(data.summary.includedMapCount, 0)
  assert.equal(data.summary.excludedMapCount, 1)
  assert.equal(data.summary.missingMapCount, 1)
  assert.equal(data.summary.partialMapCount, 0)
  assert.equal(data.summary.excludedUnitCount, 3)
  assert.equal(data.maps[0].reasons[0], 'no-hostile-spawn')
  assert.equal(data.diagnostics.excludedUnits[0].reason, 'neutral-civilian')
})

test('固定出現だけを集計し、同じ敵の条件付き出現や分岐後の別形態は加算しない', () => {
  const input = options()
  const source = input.mapIndex.maps[0]
  source.status = 'excluded'
  source.reasons = ['branch-spawn', 'hidden-spawn-group']
  source.enemySpawnCounts = { a: 10, conditional: 2 }
  source.spawnCount = null
  const level = input.levels.get(source.levelId)
  level.waves[0].fragments[0].actions.push(
    { actionType: 'SPAWN', key: 'a', count: 7, hiddenGroup: 'runtime' },
    { actionType: 'SPAWN', key: 'conditional', count: 2, hiddenGroup: 'runtime' },
  )
  level.branches = { anotherForm: { phases: [{ actions: [
    { actionType: 'SPAWN', key: 'a', count: 100 }, { actionType: 'SPAWN', key: 'boss_form2', count: 1 },
  ] }] } }
  const data = buildMainEnemyTrends(input)
  assert.equal(data.maps[0].status, 'partial')
  assert.deepEqual(data.maps[0].reasons, ['branch-spawn', 'hidden-spawn-group'])
  assert.deepEqual(data.maps[0].enemies.map(({ enemyId, count }) => [enemyId, count]), [['a', 3]])
  assert.equal(data.summary.includedMapCount, 1)
  assert.equal(data.summary.partialMapCount, 1)
  assert.equal(data.summary.excludedMapCount, 0)
})

test('不明な出現仕様・壊れた出現設定・通常敵置換は固定出現があってもマップ全体を対象外にする', () => {
  const cases = [
    ['unsupported-spawn-field:futureRule', (level) => {
      level.waves[0].fragments[0].actions.push({ actionType: 'SPAWN', key: 'unknown', count: 1, futureRule: true })
    }],
    ['invalid-spawn-count', (level) => {
      level.waves[0].fragments[0].actions.push({ actionType: 'SPAWN', key: 'unknown', count: -1 })
    }],
    ['invalid-branches', (level) => { level.branches = [] }],
    ['enemy-replacement', (level) => { level.runes = [{ key: 'level_enemy_replace', difficultyMask: 'NORMAL' }] }],
  ]
  for (const [reason, mutate] of cases) {
    const input = options()
    input.mapIndex.maps[0].status = 'excluded'
    input.mapIndex.maps[0].reasons = [reason]
    mutate(input.levels.get(input.mapIndex.maps[0].levelId))
    const data = buildMainEnemyTrends(input)
    assert.equal(data.maps[0].status, 'excluded', reason)
    assert.equal(data.maps[0].enemyCount, 0, reason)
    assert.equal(data.summary.partialMapCount, 0, reason)
  }
})

test('ゼロ体の条件付き設定だけでは一部集計に変えない', () => {
  const input = options()
  input.levels.get(input.mapIndex.maps[0].levelId).waves[0].fragments[0].actions.push(
    { actionType: 'SPAWN', key: 'conditional', count: 0, hiddenGroup: 'runtime' },
  )
  const data = buildMainEnemyTrends(input)
  assert.equal(data.maps[0].status, 'included')
  assert.equal(data.summary.partialMapCount, 0)
  assert.equal(data.summary.enemyCount, 3)
})

test('通常ステータス補正は未対応扱いにするが強襲の補正を標準値へ掛けない', () => {
  const input = options()
  const level = input.levels.get('obt/main/level_main_00-01')
  level.runes = [{ key: 'enemy_attribute_mul', difficultyMask: 'FOUR_STAR', blackboard: [{ key: 'max_hp', value: 2 }] }]
  assert.equal(buildMainEnemyTrends(input).maps[0].enemies[0].hp, 100)
  level.runes[0].difficultyMask = 'NORMAL'
  assert.deepEqual(buildMainEnemyTrends(input).maps[0].reasons, ['unsupported-normal-stat-rune'])
})

test('元マップと公開indexの出現数・固定判定が不一致なら生成を止める', () => {
  const input = options()
  input.mapIndex.maps[0].enemySpawnCounts.a = 4
  assert.throws(() => buildMainEnemyTrends(input), /spawn counts disagree/)
  input.mapIndex.maps[0].enemySpawnCounts.a = 3
  input.levels.get('obt/main/level_main_00-01').waves[0].fragments[0].actions[0].hiddenGroup = 'challenge'
  assert.throws(() => buildMainEnemyTrends(input), /schedule disagree/)
})

test('非攻撃の聖杯は残し、惘核の非敵化は16-9だけに限定する', () => {
  const input = options()
  const id = 'enemy_10128_fearpj'
  input.database[id] = [{ level: 0, enemyData: baseEnemy() }]
  input.database.enemy_1430_lrrook = [{ level: 0, enemyData: baseEnemy({ levelType: defined('ELITE'),
    attributes: { maxHp: defined(100000), atk: defined(0), def: defined(0), magicResistance: defined(30) } }) }]
  const sourceMap = map({ stageId: 'm16', levelId: 'obt/main/level_main_16-08', code: '16-9',
    enemySpawnCounts: { [id]: 8, enemy_1430_lrrook: 1 }, spawnCount: 9 })
  input.mapIndex.maps = [sourceMap]
  input.stageTable.stages.m16 = stage(sourceMap.levelId)
  input.levels = new Map([[sourceMap.levelId, { enemyDbRefs: [{ id, useDb: true, level: 0,
    overwrittenData: { attributes: { atk: defined(0) }, lifePointReduce: defined(0), notCountInTotal: defined(true) } },
    { id: 'enemy_1430_lrrook', useDb: true, level: 0 }], waves: [{ fragments: [{ actions: [
      { actionType: 'SPAWN', key: id, count: 8 }, { actionType: 'SPAWN', key: 'enemy_1430_lrrook', count: 1 },
    ] }] }] }]])
  const data = buildMainEnemyTrends(input)
  assert.deepEqual(data.maps[0].enemies.map((enemy) => enemy.enemyId), ['enemy_1430_lrrook'])
  assert.equal(data.summary.excludedUnitCount, 8)
  const originalLevel = input.levels.get(sourceMap.levelId)
  sourceMap.levelId = 'obt/main/level_main_16-09'
  input.stageTable.stages.m16.levelId = sourceMap.levelId
  input.levels = new Map([[sourceMap.levelId, originalLevel]])
  assert.equal(buildMainEnemyTrends(input).summary.enemyCount, 9)
})

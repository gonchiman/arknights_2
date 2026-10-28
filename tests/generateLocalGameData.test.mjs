import test from 'node:test'
import assert from 'node:assert/strict'
import { generateLocalGameData } from '../scripts/generateLocalGameData.mjs'
import { LOCAL_GAME_DATA_GENERATED_FILES, LOCAL_GAME_DATA_RUNTIME_FILES } from '../src/lib/localGameDataContract.ts'

const generatedAt = '2026-10-21T00:00:00.000Z'
const revision = 'a'.repeat(40)
const mainId = 'obt/main/level_main_00-01'
const easyId = 'obt/main/level_main_00-01_easy'
const eventId = 'activities/test/level_event'
const spawn = (key, count, extra = {}) => ({ actionType: 'SPAWN', key, count, ...extra })
const level = (actions) => ({
  enemyDbRefs: [{ id: 'enemy_a', level: 0, useDb: true }],
  mapData: { map: [[0, 1]], tiles: [
    { tileKey: 'tile_start', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
    { tileKey: 'tile_end', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
  ] },
  waves: [{ fragments: [{ actions }] }],
})
const stage = (stageId, levelId, extra = {}) => ({
  stageId, levelId, isStoryOnly: false, code: '0-1', name: '始まり', zoneId: 'main_0',
  stageType: 'MAIN', appearanceStyle: 'MAIN_NORMAL', difficulty: 'NORMAL', diffGroup: 'NONE', ...extra,
})
function fixture() {
  return {
    revision,
    character: { char_test: { name: 'テスト', phases: [{ maxLevel: 50 }], skills: [{ skillId: 'skill_test' }] } },
    skill: { skill_test: { skillId: 'skill_test', levels: [{ name: 'スキル', description: '攻撃力+10%' }] } },
    uniequip: { equipDict: { module_test: { charId: 'char_test', uniEquipId: 'module_test' } },
      subProfDict: { guard: { subProfessionId: 'guard', subProfessionName: '前衛' } } },
    battleEquip: { module_test: { phases: [{ equipLevel: 1, attributeBlackboard: [{ key: 'atk', value: 30 }] }] } },
    handbookTeam: { rhodes: { powerId: 'rhodes', powerName: 'ロドス・アイランド' } },
    stageTable: { stages: {
      'main_00-01': stage('main_00-01', mainId),
      'main_00-01#f#': stage('main_00-01#f#', mainId, { difficulty: 'FOUR_STAR' }),
      easy: stage('easy', easyId, { diffGroup: 'EASY' }),
      event: stage('event', eventId, { stageType: 'ACTIVITY', zoneId: 'event' }),
    } },
    zoneTable: { zones: { main_0: { zoneNameFirst: '序章', type: 'MAINLINE' }, event: { type: 'ACTIVITY' } } },
    handbook: { enemyData: { enemy_a: { enemyId: 'enemy_a', name: '兵士', enemyLevel: 'NORMAL' } } },
    database: { enemy_a: [{ level: 0, enemyData: {
      name: { m_defined: true, m_value: '兵士' },
      attributes: { maxHp: { m_defined: true, m_value: 100 }, atk: { m_defined: true, m_value: 20 },
        def: { m_defined: true, m_value: 10 }, magicResistance: { m_defined: true, m_value: 0 } },
    } }] },
    levels: new Map([[mainId, level([spawn('enemy_a', 3)])],
      [easyId, level([spawn('enemy_a', 99)])], [eventId, level([spawn('enemy_a', 5)])]]),
  }
}

test('one revision generates matching appearances, maps, details and chapter data without changing inputs', () => {
  const source = fixture(), original = structuredClone(source)
  const files = generateLocalGameData(source, { generatedAt })
  assert.equal(files.size, 27)
  const appearances = files.get('enemy-stage-appearances.json')
  const histogram = files.get('enemy-histogram-counts.json')
  const index = files.get('maps/index.json')
  const trends = files.get('maps/main-enemy-trends.json')
  assert.equal(appearances.enemies.enemy_a.stageCount, 2)
  assert.deepEqual(histogram.enemies.enemy_a, { mapCount: 2, spawnCount: 8 })
  assert.equal(histogram.summary.excludedMapCount, 1)
  assert.equal(index.maps.length, 3)
  const main = index.maps.find((map) => map.levelId === mainId)
  assert.equal(main.spawnCount, 3)
  assert.deepEqual(files.get(`maps/${main.detailFile}`).maps[mainId].enemies, [{ id: 'enemy_a', count: 3 }])
  assert.equal(trends.summary.enemyCount, 3)
  assert.equal(trends.chapters[0].enemyCount, 3)
  assert.equal(trends.maps[0].enemies[0].hp, 100)
  for (const filename of LOCAL_GAME_DATA_GENERATED_FILES) {
    const document = files.get(filename)
    assert.equal(document.generatedAt, generatedAt)
    assert.equal(document.source.revision, revision)
    assert.match(document.source.stageTableUrl, new RegExp(`/${revision}/jp/gamedata/excel/stage_table.json$`))
    assert.equal(JSON.stringify(document).includes('/master/'), false)
  }
  assert.deepEqual(source, original)
  assert.deepEqual(generateLocalGameData(source, { generatedAt }), files)
})

test('other-category maps stay in the map database but never contribute to enemy statistics or missing coverage', () => {
  const otherId = 'obt/legion/level_other'
  for (const zoneType of ['CAMPAIGN', 'GUIDE', 'CLIMB_TOWER', 'FUTURE']) for (const available of [true, false]) {
    const source = fixture()
    // Deliberately keep stageType MAIN: the shared scope rule must use the zone table.
    source.stageTable.stages.other = stage('other', otherId, { zoneId: 'other' })
    source.zoneTable.zones.other = { type: zoneType }
    if (available) {
      const other = level([spawn('enemy_a', 100), spawn('enemy_other', 200)])
      other.enemyDbRefs.push({ id: 'enemy_other', level: 0 })
      source.levels.set(otherId, other)
    } else source.missingLevelIds = [otherId]

    const files = generateLocalGameData(source, { generatedAt })
    const appearances = files.get('enemy-stage-appearances.json')
    const histogram = files.get('enemy-histogram-counts.json')
    assert.equal(appearances.status, 'complete')
    assert.equal(appearances.enemies.enemy_a.stageCount, 2)
    assert.equal(appearances.enemies.enemy_other, undefined)
    assert.equal(appearances.summary.uniqueLevelCount, 2)
    assert.equal(appearances.summary.failedLevelCount, 0)
    assert.ok(appearances.diagnostics.excludedLevelIds.includes(otherId))
    assert.deepEqual(histogram.enemies, { enemy_a: { mapCount: 2, spawnCount: 8 } })
    assert.equal(histogram.summary.excludedMapCount, 2)
    assert.equal(histogram.summary.missingMapCount, 0)
    assert.deepEqual(histogram.diagnostics.missingLevelIds, [])

    const index = files.get('maps/index.json')
    assert.equal(index.maps.length, 4)
    const map = index.maps.find((entry) => entry.levelId === otherId)
    assert.equal(map.zoneType, zoneType)
    assert.equal(map.status, available ? 'supported' : 'missing')
    if (available) {
      assert.equal(map.spawnCount, 300)
      assert.deepEqual(files.get(`maps/${map.detailFile}`).maps[otherId].enemies,
        [{ id: 'enemy_a', count: 100 }, { id: 'enemy_other', count: 200 }])
    }
    assert.equal(files.get('maps/main-enemy-trends.json').summary.enemyCount, 3)
  }
})

test('startup snapshots apply default-off groups consistently across histogram and maps', () => {
  const source = fixture()
  const toughId = 'obt/main/level_tough_00-01'
  source.stageTable.stages.tough = stage('tough_00-01', toughId, { diffGroup: 'TOUGH' })
  const normal = source.levels.get(mainId)
  normal.enemyDbRefs.push({ id: 'enemy_b', level: 0, useDb: true })
  normal.waves[0].fragments[0].actions.push(spawn('enemy_a', 7, { hiddenGroup: 'extra' }))
  normal.runes = [
    { key: 'level_hidden_group_enable', difficultyMask: 'FOUR_STAR', blackboard: [{ key: 'key', valueStr: 'extra' }] },
    { key: 'level_enemy_replace', difficultyMask: 'FOUR_STAR', blackboard: [
      { key: 'key', valueStr: 'enemy_a' }, { key: 'value', valueStr: 'enemy_b' },
    ] },
  ]
  source.levels.set(toughId, structuredClone(normal))

  const files = generateLocalGameData(source, { generatedAt })
  const histogram = files.get('enemy-histogram-counts.json')
  const appearances = files.get('enemy-stage-appearances.json')
  const maps = files.get('maps/index.json').maps
  const normalMap = maps.find((map) => map.levelId === mainId)
  const toughMap = maps.find((map) => map.levelId === toughId)
  assert.equal(normalMap.status, 'supported')
  assert.equal(normalMap.spawnCount, 3)
  assert.equal(toughMap.status, 'supported')
  assert.equal(toughMap.spawnCount, 10)
  assert.deepEqual(files.get(`maps/${normalMap.detailFile}`).maps[mainId].enemies,
    [{ id: 'enemy_a', count: 3 }, { id: 'enemy_b', count: 0 }])
  assert.deepEqual(files.get(`maps/${toughMap.detailFile}`).maps[toughId].enemies,
    [{ id: 'enemy_a', count: 0 }, { id: 'enemy_b', count: 10 }])
  // The FOUR_STAR alias shares the normal level; EASY remains outside statistics.
  assert.equal(histogram.summary.mapCount, 3)
  assert.equal(histogram.summary.spawnMapCount, 3)
  assert.equal(histogram.summary.spawnExcludedMapCount, 0)
  assert.deepEqual(histogram.enemies, {
    enemy_a: { mapCount: 3, spawnCount: 8 }, enemy_b: { mapCount: 2, spawnCount: 10 },
  })
  assert.equal(appearances.enemies.enemy_a.stageCount, 3)
  assert.equal(appearances.enemies.enemy_b.stageCount, 2)
  const includedMaps = maps.filter((map) => map.levelId !== easyId)
  assert.equal(Object.values(histogram.enemies).reduce((sum, enemy) => sum + enemy.spawnCount, 0),
    includedMaps.reduce((sum, map) => sum + map.spawnCount, 0))
})

test('all seven runtime tables retain exact upstream shape and content without generated metadata', () => {
  const source = fixture()
  const original = structuredClone(source)
  const files = generateLocalGameData(source, { generatedAt })
  const expected = {
    character: source.character, skill: source.skill, uniequip: source.uniequip,
    battleEquip: source.battleEquip, handbookTeam: source.handbookTeam,
    enemyHandbook: source.handbook, enemyDatabase: source.database,
  }
  for (const [key, filename] of Object.entries(LOCAL_GAME_DATA_RUNTIME_FILES)) {
    assert.equal(files.get(filename), expected[key], filename)
    assert.deepEqual(JSON.parse(JSON.stringify(files.get(filename))), expected[key], filename)
    assert.equal(Object.hasOwn(files.get(filename), 'source'), false, filename)
    assert.equal(Object.hasOwn(files.get(filename), 'generatedAt'), false, filename)
  }
  assert.deepEqual(source, original)
})

test('runtime tables and generated enemy stats move to the same changed source', () => {
  const firstSource = fixture()
  const first = generateLocalGameData(firstSource, { generatedAt })
  const secondSource = structuredClone(firstSource)
  secondSource.revision = 'b'.repeat(40)
  secondSource.character.char_test.name = '更新後'
  secondSource.skill.skill_test.levels[0].description = '攻撃力+20%'
  secondSource.battleEquip.module_test.phases[0].attributeBlackboard[0].value = 60
  secondSource.database.enemy_a[0].enemyData.attributes.maxHp.m_value = 400
  const second = generateLocalGameData(secondSource, { generatedAt })
  assert.equal(first.get(LOCAL_GAME_DATA_RUNTIME_FILES.character).char_test.name, 'テスト')
  assert.equal(second.get(LOCAL_GAME_DATA_RUNTIME_FILES.character).char_test.name, '更新後')
  assert.equal(second.get(LOCAL_GAME_DATA_RUNTIME_FILES.skill).skill_test.levels[0].description, '攻撃力+20%')
  assert.equal(second.get(LOCAL_GAME_DATA_RUNTIME_FILES.battleEquip).module_test.phases[0].attributeBlackboard[0].value, 60)
  assert.equal(second.get(LOCAL_GAME_DATA_RUNTIME_FILES.enemyDatabase).enemy_a[0].enemyData.attributes.maxHp.m_value, 400)
  assert.equal(second.get('maps/index.json').enemies.enemy_a.hp, 400)
  assert.equal(second.get('maps/index.json').source.revision, secondSource.revision)
})

test('direct generation rejects absent, empty and malformed runtime tables', () => {
  for (const key of ['character', 'skill', 'uniequip', 'battleEquip', 'handbookTeam']) {
    for (const value of [undefined, null, {}, [], { invalid: null }]) {
      const source = fixture()
      source[key] = value
      assert.throws(() => generateLocalGameData(source, { generatedAt }), /table|runtime|Runtime/i, key)
    }
  }
})

test('a changed source updates every affected aggregate in the same snapshot', () => {
  const source = fixture()
  source.revision = 'b'.repeat(40)
  source.levels.get(mainId).waves[0].fragments[0].actions[0].count = 7
  source.database.enemy_a[0].enemyData.attributes.maxHp.m_value = 250
  const files = generateLocalGameData(source, { generatedAt })
  const main = files.get('maps/index.json').maps.find((map) => map.levelId === mainId)
  assert.equal(files.get('enemy-histogram-counts.json').enemies.enemy_a.spawnCount, 12)
  assert.equal(main.spawnCount, 7)
  assert.equal(files.get(`maps/${main.detailFile}`).maps[mainId].enemies[0].count, 7)
  assert.equal(files.get('maps/main-enemy-trends.json').chapters[0].enemyCount, 7)
  assert.equal(files.get('maps/main-enemy-trends.json').maps[0].enemies[0].hp, 250)
  assert.equal(files.get('maps/index.json').enemies.enemy_a.hp, 250)
  assert.equal(files.get('maps/index.json').source.revision, source.revision)
})

test('missing levels, empty source tables and malformed database entries fail instead of publishing partial data', () => {
  const cases = [
    [(input) => input.levels.delete(mainId), /Missing source level/],
    [(input) => input.levels.delete(easyId), /Missing source level/],
    [(input) => input.levels.set(mainId, {}), /Invalid source level/],
    [(input) => { input.stageTable = { stages: {} } }, /stage table/],
    [(input) => { input.zoneTable = { zones: {} } }, /zone table/],
    [(input) => { input.handbook = { enemyData: {} } }, /enemy handbook/],
    [(input) => { input.database = {} }, /enemy database/],
    [(input) => { input.database.enemy_a = [{ level: 0 }] }, /enemy database entry/],
    [(input) => { input.revision = 'master' }, /full source revision/],
    [(input) => { input.levels = {} }, /must be a Map/],
  ]
  for (const [mutate, expected] of cases) {
    const source = fixture()
    mutate(source)
    assert.throws(() => generateLocalGameData(source, { generatedAt }), expected)
  }
  assert.throws(() => generateLocalGameData(fixture(), { generatedAt: 'invalid' }), /timestamp/)
})

test('lower-bound generation retains fixed spawns while preserving raw uncertainty and strict legacy mode', () => {
  const source = fixture()
  source.levels.get(mainId).waves[0].fragments[0].actions.push(spawn('enemy_a', 20, { condition: 'phase2' }))
  source.levels.get(eventId).waves[0].fragments[0].actions[0].futureRule = true
  const files = generateLocalGameData(source, { generatedAt })
  const histogram = files.get('enemy-histogram-counts.json')
  assert.deepEqual(histogram.enemies.enemy_a, { mapCount: 2, spawnCount: 3 })
  assert.equal(histogram.summary.spawnExcludedMapCount, 1)
  assert.equal(histogram.summary.lowerBoundMapCount, 1)
  assert.equal(histogram.spawnAggregationMode, 'lower-bound')
  assert.equal(files.get('enemy-stage-appearances.json').status, 'complete')
  const index = files.get('maps/index.json')
  const main = index.maps.find((map) => map.levelId === mainId)
  assert.equal(main.status, 'excluded')
  assert.equal(main.spawnCount, null)
  assert.equal(main.spawnAggregation.kind, 'lower-bound')
  assert.equal(main.spawnAggregation.count, 3)
  assert.equal(files.get(`maps/${main.detailFile}`).maps[mainId].enemies[0].count, null)
  const trends = files.get('maps/main-enemy-trends.json')
  assert.equal(trends.maps[0].status, 'partial')
  assert.equal(trends.maps[0].enemyCount, 3)
  const legacyFiles = generateLocalGameData(source, { generatedAt, spawnAggregationMode: 'strict' })
  const legacyHistogram = legacyFiles.get('enemy-histogram-counts.json')
  assert.deepEqual(legacyHistogram.enemies.enemy_a, { mapCount: 2, spawnCount: 0 })
  assert.equal(legacyHistogram.summary.spawnExcludedMapCount, 2)
  assert.equal(legacyHistogram.summary.lowerBoundMapCount, undefined)
  assert.equal(legacyFiles.get('maps/index.json').maps.find((map) => map.levelId === mainId).spawnAggregation, undefined)
})

test('special levels with unavailable wave structure retain their geometry and references with unknown spawn counts', () => {
  const source = fixture()
  // The raft basic level is a real example of geometry + enemy refs with waves:{}.
  source.levels.get(eventId).waves = {}
  const files = generateLocalGameData(source, { generatedAt })
  const map = files.get('maps/index.json').maps.find((entry) => entry.levelId === eventId)
  assert.equal(map.status, 'excluded')
  assert.deepEqual(map.reasons, ['invalid-waves'])
  assert.equal(map.spawnCount, null)
  assert.deepEqual(map.enemyIds, ['enemy_a'])
  const detail = files.get(`maps/${map.detailFile}`).maps[eventId]
  assert.deepEqual(detail.grid, [[0, 1]])
  assert.equal(detail.waves, null)
  assert.deepEqual(detail.enemies, [{ id: 'enemy_a', count: null }])
  assert.deepEqual(files.get('enemy-histogram-counts.json').enemies.enemy_a, { mapCount: 2, spawnCount: 3 })
})

test('exported enemy database Key/Value formats also resolve chapter enemy stats', () => {
  const source = fixture()
  source.database = { enemies: [{ Key: 'enemy_a', Value: source.database.enemy_a }] }
  const files = generateLocalGameData(source, { generatedAt })
  assert.equal(files.get('maps/main-enemy-trends.json').maps[0].enemies[0].attack, 20)
  assert.equal(files.get('maps/index.json').enemies.enemy_a.attack, 20)
})

test('only omissions declared from the immutable source tree retain explicit partial and missing coverage', () => {
  const source = fixture()
  source.levels.delete(mainId)
  source.levels.delete(easyId)
  source.missingLevelIds = [mainId, easyId]
  const files = generateLocalGameData(source, { generatedAt })
  const appearances = files.get('enemy-stage-appearances.json')
  assert.equal(appearances.status, 'partial')
  assert.deepEqual(appearances.diagnostics.failedLevelIds, [mainId])
  assert.equal(appearances.enemies.enemy_a.stageCount, 1)
  const histogram = files.get('enemy-histogram-counts.json')
  assert.equal(histogram.summary.missingMapCount, 1)
  assert.equal(histogram.summary.mapCount, 1)
  assert.deepEqual(histogram.enemies.enemy_a, { mapCount: 1, spawnCount: 5 })
  assert.deepEqual(files.get('maps/index.json').maps.filter((map) => map.status === 'missing').map((map) => map.levelId),
    [mainId, easyId])
  assert.equal(files.get('maps/main-enemy-trends.json').summary.missingMapCount, 1)
  source.missingLevelIds = [easyId]
  assert.throws(() => generateLocalGameData(source, { generatedAt }), /Missing source level/)
})

test('missing declarations cannot hide available levels, introduce unknown IDs or erase the whole dataset', () => {
  for (const missingLevelIds of [[mainId], ['obt/unknown'], [mainId, mainId]]) {
    const source = fixture()
    source.missingLevelIds = missingLevelIds
    assert.throws(() => generateLocalGameData(source, { generatedAt }), /missing source level declaration/)
  }
  const source = fixture()
  source.missingLevelIds = [...source.levels.keys()]
  source.levels.clear()
  assert.throws(() => generateLocalGameData(source, { generatedAt }), /No source battle levels/)
})

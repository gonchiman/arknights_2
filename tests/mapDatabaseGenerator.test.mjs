import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMapDatabase, buildMapEnemyRegistry, extractMapFeatures, extractMapGeometry, mapDetailFile } from '../scripts/generateMapDatabase.mjs'

const tiles = [
  { tileKey: 'tile_start', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
  { tileKey: 'tile_wall', heightType: 'HIGHLAND', buildableType: 'RANGED', passableMask: 'FLY_ONLY' },
  { tileKey: 'tile_end', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
]
const geometry = { map: [[2, 0, 1], [0, 1, 2]], tiles }
const spawn = (id, count, extra = {}) => ({ actionType: 'SPAWN', key: id, count, ...extra })
const level = (levelId, actions, extra = {}) => ({
  levelId, data: {
    mapData: geometry, enemyDbRefs: [{ id: 'enemy_a' }, { id: 'enemy_b' }],
    waves: [{ fragments: [{ actions }] }], options: { maxLifePoint: 3, initialCost: 12, characterLimit: 7 }, ...extra,
  },
})
const stage = (stageId, levelId, overrides = {}) => ({
  stageId, levelId, code: '10-5', name: '都市の呼吸', zoneId: 'main_10', isStoryOnly: false,
  difficulty: 'NORMAL', ...overrides,
})
const options = (levels, stages = {}) => ({
  stageTable: { stages }, zoneTable: { zones: { main_10: { zoneNameFirst: '第十章', zoneNameSecond: '光冠残蝕', type: 'MAINLINE' } } },
  handbook: { enemyData: { enemy_a: { name: '兵士' }, enemy_b: { name: '猟犬', hideInHandbook: true } } },
  database: {}, levels, generatedAt: '2026-09-30T00:00:00Z', sourceGeneratedAt: '2026-08-31T00:00:00Z',
})

test('stage display codes come from the stage table; normal and challenge share one level', () => {
  const output = buildMapDatabase(options([level('obt/main/level_main_10-04', [spawn('enemy_a', 2), spawn('enemy_a', 3), spawn('enemy_b', 4)])], {
    challenge: stage('main_10-04#f#', 'Obt/Main/level_main_10-04', { difficulty: 'FOUR_STAR' }),
    normal: stage('main_10-04', 'obt/main/level_main_10-04'),
    story: stage('main_10-04_story', 'obt/main/unused', { isStoryOnly: true }),
  }))
  assert.equal(output.index.maps.length, 1)
  assert.deepEqual(output.index.maps[0], {
    levelId: 'obt/main/level_main_10-04', stageId: 'main_10-04', code: '10-5', name: '都市の呼吸',
    zoneId: 'main_10', zoneName: '第十章 光冠残蝕', zoneType: 'MAINLINE', difficulty: 'NORMAL', status: 'supported', spawnCount: 9,
    enemyIds: ['enemy_a', 'enemy_b'], features: [], reasons: [], detailFile: mapDetailFile('obt/main/level_main_10-04'),
  })
  const detail = output.details[output.index.maps[0].detailFile].maps['obt/main/level_main_10-04']
  assert.deepEqual(detail.enemies, [{ id: 'enemy_a', count: 5 }, { id: 'enemy_b', count: 4 }])
  assert.equal(detail.life, 3)
  assert.equal(detail.initialCost, 12)
  assert.equal(detail.deployLimit, 7)
})

test('unsupported conditional spawn makes the entire map and every enemy count unknown', () => {
  const output = buildMapDatabase(options([level('obt/conditional', [spawn('enemy_a', 9), spawn('enemy_b', 1, { hiddenGroup: 'phase2' })])], {
    conditional: stage('conditional', 'obt/conditional'),
  }))
  const summary = output.index.maps[0]
  assert.equal(summary.status, 'excluded')
  assert.equal(summary.spawnCount, null)
  assert.deepEqual(summary.reasons, ['hidden-spawn-group'])
  assert.deepEqual(output.details[summary.detailFile].maps[summary.levelId].enemies,
    [{ id: 'enemy_a', count: null }, { id: 'enemy_b', count: null }])
})

test('missing target levels remain searchable rather than disappearing or showing zero enemies', () => {
  const output = buildMapDatabase(options([], { missing: stage('missing', 'obt/missing') }))
  const summary = output.index.maps[0]
  assert.equal(summary.status, 'missing')
  assert.equal(summary.spawnCount, null)
  assert.equal(summary.detailFile, null)
  assert.equal(summary.features, null)
  assert.deepEqual(summary.reasons, ['missing-level'])
  assert.equal(Object.values(output.details).flatMap((shard) => Object.keys(shard.maps)).length, 0)
})

test('zone classification uses the upstream type independently of IDs, names, and level availability', () => {
  const input = options([], {
    event: stage('event', 'obt/event', { zoneId: 'main_10', name: 'メインテーマ' }),
    main: stage('main', 'obt/main', { zoneId: 'act_main', diffGroup: 'TOUGH' }),
    weekly: stage('weekly', 'obt/weekly', { zoneId: 'weekly_soc', code: 'PR-A-1' }),
  })
  input.zoneTable = { zones: {
    main_10: { type: 'ACTIVITY', zoneNameFirst: '第十章', zoneNameSecond: '光冠残蝕' },
    act_main: { type: 'MAINLINE_ACTIVITY', zoneNameFirst: '解離結合' },
    weekly_soc: { type: 'WEEKLY', zoneNameFirst: '重装/医療' },
  } }
  const output = buildMapDatabase(input)
  assert.deepEqual(output.index.maps.map((map) => [map.stageId, map.zoneType]), [
    ['event', 'ACTIVITY'], ['main', 'MAINLINE_ACTIVITY'], ['weekly', 'WEEKLY'],
  ])
  assert.deepEqual(output.index.maps[1], {
    levelId: 'obt/main', stageId: 'main', code: '10-5', name: '都市の呼吸',
    zoneId: 'act_main', zoneName: '解離結合', zoneType: 'MAINLINE_ACTIVITY',
    difficulty: 'NORMAL', diffGroup: 'TOUGH', status: 'missing', spawnCount: null,
    enemyIds: [], features: null, reasons: ['missing-level'], detailFile: null,
  })
  assert.equal(output.index.generatedAt, input.generatedAt)
  assert.equal(output.index.sourceGeneratedAt, input.sourceGeneratedAt)
})

test('missing zone records or types remain explicit UNKNOWN without inferring a category', () => {
  for (const zone of [undefined, null, {}, { type: null }, { type: '' }, { type: 2 }]) {
    const input = options([], { missing: stage('missing', 'obt/missing') })
    input.zoneTable = { zones: { main_10: zone } }
    const output = buildMapDatabase(input)
    assert.deepEqual(output.index.maps[0], {
      levelId: 'obt/missing', stageId: 'missing', code: '10-5', name: '都市の呼吸',
      zoneId: 'main_10', zoneName: 'main_10', zoneType: 'UNKNOWN', difficulty: 'NORMAL',
      status: 'missing', spawnCount: null, enemyIds: [], features: null, reasons: ['missing-level'], detailFile: null,
    })
  }
})

test('same display code keeps distinct environment levels and their difficulty metadata', () => {
  const output = buildMapDatabase(options([], {
    easy: stage('easy_10-04', 'obt/main/level_easy_10-04', { diffGroup: 'EASY' }),
    normal: stage('main_10-04', 'obt/main/level_main_10-04', { diffGroup: 'NORMAL' }),
    tough: stage('tough_10-04', 'obt/main/level_tough_10-04', { diffGroup: 'TOUGH' }),
  }))
  assert.equal(output.index.maps.length, 3)
  assert.deepEqual(output.index.maps.map((map) => [map.code, map.difficulty, map.diffGroup]), [
    ['10-5', 'NORMAL', 'EASY'], ['10-5', 'NORMAL', 'NORMAL'], ['10-5', 'NORMAL', 'TOUGH'],
  ])
})

test('hidden enemies retain names, database level zero supplies base stats, and undefined values remain null', () => {
  const result = buildMapEnemyRegistry({ enemyData: { hidden: { name: '隠れた敵', hideInHandbook: true } } }, {
    hidden: [{ level: 1, enemyData: { attributes: { maxHp: 9000, atk: 900, def: 800 } } }, {
      level: 0, enemyData: { attributes: {
        maxHp: { m_defined: true, m_value: 1500 }, atk: { m_defined: true, m_value: 300 },
        def: { m_defined: false, m_value: 800 }, magicResistance: { m_defined: false, m_value: 90 },
      } },
    }],
    only_database: [{ level: 0, enemyData: {
      name: { m_defined: true, m_value: 'データベース敵' },
      attributes: { maxHp: 2000, atk: 0, def: { m_defined: true, m_value: 0 }, magicResistance: 0 },
    } }],
  })
  assert.deepEqual(result.hidden, { name: '隠れた敵', hp: 1500, attack: 300, defense: null, resistance: null })
  assert.deepEqual(result.only_database, { name: 'データベース敵', hp: 2000, attack: 0, defense: 0, resistance: 0 })
})

test('matrix and nested-array sources retain asymmetric row and column order when compacting tiles', () => {
  const source = { mapData: { ...geometry, tiles: [...tiles, { ...tiles[0] }], map: [[2, 3, 1], [0, 1, 2]] } }
  const result = extractMapGeometry(source)
  assert.equal(result.tiles.length, 3)
  assert.deepEqual(result.grid.map((row) => row.map((index) => result.tiles[index].tileKey)), [
    ['tile_end', 'tile_start', 'tile_wall'], ['tile_start', 'tile_wall', 'tile_end'],
  ])
  const matrix = extractMapGeometry({ mapData: { tiles, map: { row_size: 2, column_size: 3, matrix_data: [2, 0, 1, 0, 1, 2] } } })
  assert.deepEqual(matrix, result)
  for (const badMap of [
    [[0, 1], [2]], [[0, 99]], [[0, -1]], [[0, 1.5]],
    { row_size: 2, column_size: 3, matrix_data: [0, 1] },
    { row_size: 0, column_size: 3, matrix_data: [] },
  ]) assert.throws(() => extractMapGeometry({ mapData: { tiles, map: badMap } }), /Invalid map/)
})

test('SPAWN-only enemies are included and registered-but-unused enemies stay zero on supported maps', () => {
  const output = buildMapDatabase(options([level('obt/test', [spawn('enemy_a', 3), spawn('unregistered', 2)])], {
    test: stage('test', 'obt/test'),
  }))
  const summary = output.index.maps[0]
  assert.deepEqual(summary.enemyIds, ['enemy_a', 'enemy_b', 'unregistered'])
  assert.equal(summary.spawnCount, 5)
  assert.deepEqual(output.index.enemies.unregistered, { name: 'unregistered', hp: null, attack: null, defense: null, resistance: null })
  assert.deepEqual(output.details[summary.detailFile].maps[summary.levelId].enemies,
    [{ id: 'enemy_a', count: 3 }, { id: 'enemy_b', count: 0 }, { id: 'unregistered', count: 2 }])
})

const featureSource = (extra = {}) => ({ mapData: geometry, ...extra })
const buff = (prefabKey, blackboard) => ({ prefabKey, blackboard })
const device = (characterKey, extra = {}) => ({ inst: { characterKey }, hidden: false, ...extra })
const activate = (key, extra = {}) => ({ actionType: 'ACTIVATE_PREDEFINED', key, count: 1, ...extra })
const featureWaves = (actions) => [{ fragments: [{ actions }] }]

test('terrain features use occupied cells in either map representation, never unused palette entries', () => {
  const ids = ['hole', 'healing', 'defup', 'grass', 'gazebo', 'bigforce', 'corrosion', 'infection', 'volcano']
  const featureTiles = ids.map((id) => ({ tileKey: `tile_${id}` }))
  for (const map of [
    [ids.map((_, index) => index)],
    { row_size: 1, column_size: ids.length, matrix_data: ids.map((_, index) => index) },
  ]) assert.deepEqual(extractMapFeatures({ mapData: { map, tiles: featureTiles } }), [...ids].sort())
  assert.deepEqual(extractMapFeatures({ mapData: {
    map: [[0, 0, 1]], tiles: [...tiles, ...featureTiles],
  } }), [])
  assert.deepEqual(extractMapFeatures({ mapData: {
    map: [[0, 0, 1]], tiles: [{ tileKey: 'tile_hole' }, { tileKey: 'tile_healing_fake' }, ...featureTiles],
  } }), ['hole'])
})

test('environment features require exact buffs and active numeric parameters in array or dictionary blackboards', () => {
  for (const asBlackboard of [
    (values) => values,
    (values) => Object.entries(values).map(([key, value]) => ({ key, value })),
  ]) {
    assert.deepEqual(extractMapFeatures(featureSource({ globalBuffs: [
      buff('periodic_damage', asBlackboard({ damage: 25, interval: 0.5 })),
      buff('character_in_magiccircuit_env', asBlackboard({
        sp_recover_ratio: -0.5, 'character_in_magiccircuit[normal].sp_recover_ratio': 0.5,
      })),
    ] })), ['periodic_damage', 'sp_slow'])
  }
  for (const blackboard of [{ damage: 0, interval: 0.5 }, { damage: -25, interval: 0.5 },
    { damage: 25, interval: 0 }, { damage: '25', interval: 0.5 }, { damage: 25 }]) {
    assert.deepEqual(extractMapFeatures(featureSource({ globalBuffs: [buff('periodic_damage', blackboard)] })), [])
  }
  for (const blackboard of [{ sp_recover_ratio: 0 }, { sp_recover_ratio: 0.5 },
    { 'character_in_magiccircuit[normal].sp_recover_ratio': -0.5 }, { sp_recover_ratio: '-0.5' }]) {
    assert.deepEqual(extractMapFeatures(featureSource({ globalBuffs: [buff('character_in_magiccircuit_env', blackboard)] })), [])
  }
  assert.deepEqual(extractMapFeatures(featureSource({ globalBuffs: [
    buff('periodic_damage_conditional', { damage: 25, interval: 0.5 }),
    buff('unrelated', { sp_recover_ratio: -0.5 }),
  ] })), [])
  assert.deepEqual(extractMapFeatures(featureSource({ globalBuffs: [
    { ...buff('periodic_damage', { damage: 25, interval: 0.5 }), playerSideMask: 'UNKNOWN' },
  ] })), [])
})

test('cost features distinguish known disabled intervals from slower recovery and never infer from kill rewards', () => {
  for (const costIncreaseTime of [999, 9999, 99999, 999999, 100000000]) {
    assert.deepEqual(extractMapFeatures(featureSource({ options: { costIncreaseTime } })), ['cost_none'])
  }
  for (const costIncreaseTime of [2, 3]) {
    assert.deepEqual(extractMapFeatures(featureSource({ options: { costIncreaseTime } })), ['cost_slow'])
  }
  for (const costIncreaseTime of [undefined, null, 0, -1, 0.85, 1, '3']) {
    assert.deepEqual(extractMapFeatures(featureSource({
      options: { costIncreaseTime }, globalBuffs: [buff('kill_to_add_cost', { cost: 1 })],
    })), [])
  }
})

test('unconditional whole-map base runes scale cost recovery intervals without applying optional or challenge variants', () => {
  const rune = {
    key: 'global_cost_recovery_mul', difficultyMask: 'ALL', professionMask: 1023, buildableMask: 'ALL',
    blackboard: [{ key: 'scale', value: 3 }],
  }
  for (const difficultyMask of ['ALL', 'NORMAL']) {
    assert.deepEqual(extractMapFeatures(featureSource({ options: { costIncreaseTime: 1 },
      runes: [{ ...rune, difficultyMask }],
    })), ['cost_slow'])
  }
  assert.deepEqual(extractMapFeatures(featureSource({ options: { costIncreaseTime: 1 },
    runes: [{ ...rune, blackboard: { scale: 1.3333 } }],
  })), ['cost_slow'])
  assert.deepEqual(extractMapFeatures(featureSource({ options: { costIncreaseTime: 99999 }, runes: [rune] })), ['cost_none'])
  assert.deepEqual(extractMapFeatures(featureSource({ options: { costIncreaseTime: 2 },
    runes: [{ ...rune, blackboard: { scale: 0.5 } }],
  })), [])
  for (const change of [
    { difficultyMask: 'FOUR_STAR' }, { difficultyMask: 'SIX_STAR' }, { difficultyMask: 7 },
    { professionMask: 'MEDIC' }, { buildableMask: 'RANGED' }, { condition: 'challenge' },
    { key: 'cbuff_char_cost' }, { blackboard: { scale: 0 } }, { blackboard: { scale: '3' } },
  ]) {
    assert.deepEqual(extractMapFeatures(featureSource({ options: { costIncreaseTime: 1 },
      runes: [{ ...rune, ...change }],
    })), [])
  }
  assert.deepEqual(extractMapFeatures(featureSource({ optionalRunes: [rune] })), [])
  assert.deepEqual(extractMapFeatures(featureSource({ runes: [{
    ...rune, key: 'env_gbuff_new', blackboard: [{ key: 'key', valueStr: 'sp_recovery_reduction' },
      { key: 'sp_recovery_per_sec', value: 4 }],
  }] })), [])
})

test('device features include visible instances and nonempty cards, deduplicated by their exact character IDs', () => {
  assert.deepEqual(extractMapFeatures(featureSource({ predefines: {
    tokenInsts: [device('trap_002_emp'), device('trap_038_dsbell'), device('trap_002_emp')],
    tokenCards: [device('trap_001_crate', { initialCnt: 5 })],
  } })), ['crate', 'dsbell', 'emp'])
  assert.deepEqual(extractMapFeatures(featureSource({ predefines: {
    tokenInsts: [device('trap_001_crate')],
    tokenCards: [device('trap_002_emp', { initialCnt: 1 })],
  } })), ['emp'])
  assert.deepEqual(extractMapFeatures(featureSource({ predefines: {
    tokenInsts: [device('trap_002_emp_extra'), device('trap_038_dsbell', { hidden: true }), device('trap_001_crate')],
    tokenCards: [device('trap_001_crate', { initialCnt: 0 }), device('trap_001_crate', { initialCnt: -1 })],
  } })), [])
})

test('hidden devices are included only when an unconditional scheduled action activates their ID or alias', () => {
  assert.deepEqual(extractMapFeatures(featureSource({ predefines: {
    tokenInsts: [device('trap_002_emp', { hidden: true, alias: 'emp#1' })],
    tokenCards: [device('trap_001_crate', { hidden: true, initialCnt: 3 })],
  }, waves: featureWaves([activate('emp#1'), activate('trap_001_crate')]) })), ['crate', 'emp'])
  for (const change of [
    { hiddenGroup: 'challenge' }, { randomSpawnGroupKey: 'choice' }, { randomSpawnGroupPackKey: 'pack' },
    { randomType: 'RANDOM' }, { refreshType: 'RANDOM' }, { managedByScheduler: false }, { count: 0 },
    { count: 0.5 }, { weight: 2 }, { condition: 'challenge' }, { conditions: ['challenge'] },
    { actionType: 'PREVIEW_CURSOR' }, { key: 'trap_002_emp' },
  ]) {
    assert.deepEqual(extractMapFeatures(featureSource({ predefines: {
      tokenInsts: [device('trap_002_emp', { hidden: true, alias: 'emp#1' })],
    }, waves: featureWaves([activate('emp#1', change)]) })), [])
  }
  assert.deepEqual(extractMapFeatures(featureSource({ predefines: {
    tokenCards: [device('trap_001_crate', { hidden: true, initialCnt: 0 })],
  }, waves: featureWaves([activate('trap_001_crate')]) })), [])
  for (const change of [{ advancedWaveTag: 'optional' }, { hiddenGroup: 'challenge' }, { conditions: ['branch'] }]) {
    const predefines = { tokenInsts: [device('trap_002_emp', { hidden: true })] }
    assert.deepEqual(extractMapFeatures(featureSource({ predefines,
      waves: [{ ...featureWaves([activate('trap_002_emp')])[0], ...change }],
    })), [])
    assert.deepEqual(extractMapFeatures(featureSource({ predefines,
      waves: [{ fragments: [{ actions: [activate('trap_002_emp')], ...change }] }],
    })), [])
  }
})

test('conditional, optional, challenge-only, and unrelated device or effect definitions do not become features', () => {
  const effect = buff('periodic_damage', { damage: 25, interval: 0.5 })
  const tokens = { tokenInsts: [device('trap_002_emp')] }
  assert.deepEqual(extractMapFeatures(featureSource({
    optionalRunes: [effect], runes: [effect], hardPredefines: tokens,
    predefines: { tokenInsts: [device('trap_038_dsbell', { hidden: true })], characterInsts: tokens.tokenInsts },
    branches: { branch: { phases: featureWaves([activate('trap_038_dsbell')]) } },
  })), [])
  for (const globalBuffs of [undefined, null, {}]) {
    assert.deepEqual(extractMapFeatures(featureSource({ globalBuffs, predefines: { tokenInsts: {}, tokenCards: null } })), [])
  }
  assert.equal(extractMapFeatures(null), null)
  assert.equal(extractMapFeatures(undefined), null)
})

test('features remain available when enemy counts are excluded, while missing source is explicitly unknown', () => {
  const source = level('obt/conditional', [spawn('enemy_a', 2, { hiddenGroup: 'phase2' })], {
    mapData: { map: [[0]], tiles: [{ tileKey: 'tile_hole' }] }, options: { costIncreaseTime: 3 },
  })
  const output = buildMapDatabase(options([source], {
    conditional: stage('conditional', 'obt/conditional'), missing: stage('missing', 'obt/missing'),
  }))
  assert.equal(output.index.schemaVersion, 1)
  const present = output.index.maps.find((map) => map.stageId === 'conditional')
  assert.equal(present.status, 'excluded')
  assert.equal(present.spawnCount, null)
  assert.deepEqual(present.features, ['cost_slow', 'hole'])
  assert.equal(output.index.maps.find((map) => map.stageId === 'missing').features, null)
})

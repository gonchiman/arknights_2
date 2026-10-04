import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMapDatabase, buildMapEnemyRegistry, extractMapEnemyRoutes, extractMapEnemySpawnCounts, extractMapFeatures, extractMapGeometry, extractMapRoutes, extractMapWaves, mapDetailFile } from '../scripts/generateMapDatabase.mjs'
import { getMapEntrances } from '../src/lib/mapWaves.ts'
import { MAP_ENEMY_IMMUNITY_KEYS } from '../src/types/map.ts'

const unknownEnemyMetadata = {
  moveSpeed: null, attackInterval: null, weight: null, levelType: null, motion: null,
  attackWay: null, damageTypes: null, immunities: null,
}
const unknownImmunities = Object.fromEntries(MAP_ENEMY_IMMUNITY_KEYS.map((key) => [key, null]))

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
    enemyIds: ['enemy_a', 'enemy_b'], enemyRoutes: [
      { enemyId: 'enemy_a', routeIndex: null, fixedWaits: null, spawnKind: 'fixed', spawnCount: 5, spawnIntervals: null, entrance: null },
      { enemyId: 'enemy_b', routeIndex: null, fixedWaits: null, spawnKind: 'fixed', spawnCount: 4, spawnIntervals: null, entrance: null },
    ], enemySpawnCounts: { enemy_a: 5, enemy_b: 4 }, features: [], reasons: [], detailFile: mapDetailFile('obt/main/level_main_10-04'),
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
  assert.equal(summary.enemyRoutes, null)
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
    enemyIds: [], enemyRoutes: null, enemySpawnCounts: null, features: null, reasons: ['missing-level'], detailFile: null,
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
      status: 'missing', spawnCount: null, enemyIds: [], enemyRoutes: null, enemySpawnCounts: null,
      features: null, reasons: ['missing-level'], detailFile: null,
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
  assert.deepEqual(result.hidden, { ...unknownEnemyMetadata, name: '隠れた敵', hp: 1500, attack: 300,
    defense: null, resistance: null, immunities: unknownImmunities })
  assert.deepEqual(result.only_database, { ...unknownEnemyMetadata, name: 'データベース敵', hp: 2000, attack: 0,
    defense: 0, resistance: 0, immunities: unknownImmunities })
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
  assert.deepEqual(output.index.enemies.unregistered, { ...unknownEnemyMetadata, name: 'unregistered', hp: null, attack: null, defense: null, resistance: null })
  assert.deepEqual(output.details[summary.detailFile].maps[summary.levelId].enemies,
    [{ id: 'enemy_a', count: 3 }, { id: 'enemy_b', count: 0 }, { id: 'unregistered', count: 2 }])
})

test('AP-2-style waves preserve unequal source-time ordering and relative delay settings', () => {
  const source = { waves: [{
    preDelay: 0, postDelay: 2.5, maxTimeWaitingForNextWave: -1, advancedWaveTag: null,
    fragments: [
      { preDelay: 0, actions: [
        spawn('enemy_a', 2, { preDelay: 26, interval: 0.8, routeIndex: 4, managedByScheduler: true, blockFragment: false, dontBlockWave: false }),
        spawn('enemy_b', 1, { preDelay: 17, interval: 1, routeIndex: 5 }),
      ] },
      { preDelay: 15, actions: [spawn('enemy_a', 3, { preDelay: 8, interval: 11, routeIndex: 23 })] },
      { preDelay: 17, actions: [spawn('enemy_b', 1, { preDelay: 3, interval: 0, routeIndex: 0 })] },
    ],
  }, { preDelay: 9, postDelay: 0, maxTimeWaitingForNextWave: 45, fragments: [] }] }
  const unchanged = structuredClone(source)
  const result = extractMapWaves(source)
  assert.deepEqual(source, unchanged)
  assert.deepEqual(result.map((wave) => [wave.preDelay, wave.postDelay, wave.maxTimeWaitingForNextWave]),
    [[0, 2.5, -1], [9, 0, 45]])
  assert.deepEqual(result[0].fragments.map((fragment) => fragment.preDelay), [0, 15, 17])
  assert.deepEqual(result[0].fragments[0].actions.map((action) => [action.key, action.preDelay, action.routeIndex]),
    [['enemy_a', 26, 4], ['enemy_b', 17, 5]])
  assert.deepEqual(result[0].fragments[0].actions[0], {
    actionType: 'SPAWN', key: 'enemy_a', count: 2, preDelay: 26, interval: 0.8, routeIndex: 4,
    hiddenGroup: null, randomSpawnGroupKey: null, randomSpawnGroupPackKey: null,
    randomType: null, refreshType: null, managedByScheduler: true,
    blockFragment: false, dontBlockWave: false, spawnKind: 'fixed', reasons: [],
  })
  assert.equal(result[0].fragments[2].actions[0].interval, 0)
})

test('non-SPAWN events retain their positions and settings without contributing enemy counts', () => {
  const actions = [
    spawn('enemy_a', 1, { preDelay: 32 }),
    { actionType: 'DISPLAY_ENEMY_INFO', key: 'enemy_b', count: 3, preDelay: 8, interval: 11, routeIndex: 22 },
    spawn('enemy_b', 3, { preDelay: 8, interval: 11, routeIndex: 23 }),
    { actionType: 'PLAY_BGM', key: 'battle_theme', count: 40, preDelay: 0 },
  ]
  const output = buildMapDatabase(options([level('obt/events', actions)], {
    events: stage('events', 'obt/events'),
  }))
  const summary = output.index.maps[0]
  const detail = output.details[summary.detailFile].maps[summary.levelId]
  assert.equal(summary.status, 'supported')
  assert.equal(summary.spawnCount, 4)
  assert.deepEqual(summary.enemyIds, ['enemy_a', 'enemy_b'])
  assert.deepEqual(detail.enemies, [{ id: 'enemy_a', count: 1 }, { id: 'enemy_b', count: 3 }])
  assert.deepEqual(detail.waves[0].fragments[0].actions.map((action) => [action.actionType, action.count, action.spawnKind]), [
    ['SPAWN', 1, 'fixed'], ['DISPLAY_ENEMY_INFO', 3, null], ['SPAWN', 3, 'fixed'], ['PLAY_BGM', 40, null],
  ])
  assert.equal(detail.waves[0].fragments[0].actions[1].preDelay, 8)
})

test('conditional spawn settings are retained separately from fixed rows and unknown map totals', () => {
  const conditional = spawn('unregistered', 4, {
    preDelay: 12, interval: 3, routeIndex: 2, hiddenGroup: 'phase2',
    randomSpawnGroupKey: 'choice', randomSpawnGroupPackKey: 'pack',
    randomType: 'RANDOM', refreshType: 'ONCE', managedByScheduler: false,
    blockFragment: true, dontBlockWave: true,
  })
  const output = buildMapDatabase(options([level('obt/conditional-detail', [spawn('enemy_a', 2), conditional])], {
    conditional: stage('conditional-detail', 'obt/conditional-detail'),
  }))
  const summary = output.index.maps[0]
  const detail = output.details[summary.detailFile].maps[summary.levelId]
  const [fixed, action] = detail.waves[0].fragments[0].actions
  assert.equal(fixed.spawnKind, 'fixed')
  assert.equal(action.spawnKind, 'conditional')
  assert.deepEqual(action.reasons, [
    'conditional-spawn:randomType', 'conditional-spawn:refreshType',
    'hidden-spawn-group', 'random-spawn-group', 'unscheduled-spawn',
  ])
  for (const key of Object.keys(conditional)) assert.equal(action[key], conditional[key])
  assert.equal(summary.spawnCount, null)
  assert.equal(summary.status, 'excluded')
  assert.deepEqual(detail.enemies, [
    { id: 'enemy_a', count: null }, { id: 'enemy_b', count: null }, { id: 'unregistered', count: null },
  ])
  assert.deepEqual(output.index.enemies.unregistered, { ...unknownEnemyMetadata, name: 'unregistered', hp: null, attack: null, defense: null, resistance: null })
})

test('known conditions, zero-count conditions, and unsupported metadata do not look fixed', () => {
  for (const condition of [
    { hiddenGroup: 'hidden' }, { randomSpawnGroupKey: 'random' }, { randomSpawnGroupPackKey: 'pack' },
    { randomType: 'RANDOM' }, { refreshType: 'ONCE' }, { managedByScheduler: false },
    { weight: 1 }, { condition: 'switch' }, { conditions: ['switch'] },
  ]) {
    for (const count of [0, 1]) {
      const action = extractMapWaves(level('test', [spawn('enemy_a', count, condition)]).data)[0].fragments[0].actions[0]
      assert.equal(action.spawnKind, 'conditional', JSON.stringify({ count, condition }))
      assert.ok(action.reasons.length > 0)
    }
  }
  const tagged = extractMapWaves({ waves: [{ advancedWaveTag: 'choose_wave', fragments: [{ actions: [spawn('enemy_a', 1)] }] }] })
  assert.equal(tagged[0].advancedWaveTag, 'choose_wave')
  assert.equal(tagged[0].fragments[0].actions[0].spawnKind, 'conditional')
  assert.deepEqual(tagged[0].fragments[0].actions[0].reasons, ['unsupported-wave-tag'])
  const unknown = extractMapWaves(level('test', [spawn('enemy_a', 1, { futureRuntimeSwitch: true })]).data)[0].fragments[0].actions[0]
  assert.equal(unknown.spawnKind, 'unknown')
  assert.deepEqual(unknown.reasons, ['unsupported-spawn-field:futureRuntimeSwitch'])
})

test('missing and invalid relative settings remain null while explicit zero is retained', () => {
  const result = extractMapWaves({ waves: [{
    preDelay: -2, postDelay: NaN, maxTimeWaitingForNextWave: -2,
    fragments: [{ preDelay: undefined, actions: [
      spawn('enemy_a', -1, { preDelay: undefined, interval: Infinity, routeIndex: 1.5, managedByScheduler: 'true' }),
      spawn('enemy_b', 0, { preDelay: 0, interval: 0, routeIndex: 0, managedByScheduler: false }),
      spawn('enemy_b', 1, { preDelay: '3', interval: -1, routeIndex: -1 }),
    ] }],
  }] })
  assert.equal(result[0].preDelay, null)
  assert.equal(result[0].postDelay, null)
  assert.equal(result[0].maxTimeWaitingForNextWave, null)
  assert.equal(result[0].fragments[0].preDelay, null)
  const [invalid, zero, invalidNumbers] = result[0].fragments[0].actions
  for (const key of ['count', 'preDelay', 'interval', 'routeIndex', 'managedByScheduler']) assert.equal(invalid[key], null)
  assert.equal(invalid.spawnKind, 'unknown')
  assert.deepEqual(invalid.reasons, ['invalid-spawn-count'])
  for (const key of ['count', 'preDelay', 'interval', 'routeIndex']) assert.equal(zero[key], 0)
  assert.equal(zero.managedByScheduler, false)
  for (const key of ['preDelay', 'interval', 'routeIndex']) assert.equal(invalidNumbers[key], null)
})

test('branch spawns stay outside the main-wave schedule and prevent asserted totals', () => {
  const output = buildMapDatabase(options([level('obt/branch', [spawn('enemy_a', 2)], {
    branches: { choice: { phases: [{ actions: [spawn('enemy_b', 100)] }] } },
  })], { branch: stage('branch', 'obt/branch') }))
  const summary = output.index.maps[0]
  const detail = output.details[summary.detailFile].maps[summary.levelId]
  assert.equal(summary.spawnCount, null)
  assert.deepEqual(summary.reasons, ['branch-spawn'])
  assert.deepEqual(detail.enemies, [{ id: 'enemy_a', count: null }, { id: 'enemy_b', count: null }])
  assert.deepEqual(detail.waves[0].fragments[0].actions.map((action) => [action.key, action.count]), [['enemy_a', 2]])
})

test('unavailable schedule structure is distinct from an empty schedule and never silently drops entries', () => {
  for (const source of [
    {}, { waves: null }, { waves: {} }, { waves: [null] },
    { waves: [{ fragments: {} }] }, { waves: [{ fragments: [null] }] },
    { waves: [{ fragments: [{ actions: {} }] }] },
    { waves: [{ fragments: [{ actions: [spawn('enemy_a', 1), null] }] }] },
  ]) assert.equal(extractMapWaves(source), null)
  assert.deepEqual(extractMapWaves({ waves: [] }), [])
  assert.deepEqual(extractMapWaves({ waves: [{ fragments: [] }] }), [{
    preDelay: null, postDelay: null, maxTimeWaitingForNextWave: null, advancedWaveTag: null, fragments: [],
  }])
})

test('route extraction keeps action indices and raw starting tiles, including off-map coordinates', () => {
  const routes = [
    { startPosition: { row: 6, col: 10 }, spawnOffset: { x: 0.5, y: -0.25 } },
    null,
    { startPosition: { row: 2, col: 0 } },
    { startPosition: { row: -1, col: 11 } },
    { startPosition: { row: Number.MIN_SAFE_INTEGER, col: Number.MAX_SAFE_INTEGER } },
  ]
  const original = structuredClone(routes)
  const output = buildMapDatabase(options([level('obt/routes', [spawn('enemy_a', 1, { routeIndex: 2 })], { routes })], {
    routes: stage('routes', 'obt/routes'),
  }))
  const summary = output.index.maps[0]
  const detail = output.details[summary.detailFile].maps[summary.levelId]
  assert.deepEqual(detail.routes, [
    { startPosition: { row: 6, col: 10 } }, null, { startPosition: { row: 2, col: 0 } },
    { startPosition: { row: -1, col: 11 } },
    { startPosition: { row: Number.MIN_SAFE_INTEGER, col: Number.MAX_SAFE_INTEGER } },
  ])
  const action = detail.waves[0].fragments[0].actions[0]
  assert.equal(action.routeIndex, 2)
  assert.deepEqual(detail.routes[action.routeIndex].startPosition, { row: 2, col: 0 })
  assert.deepEqual(routes, original)
})

test('missing route topology and malformed starting positions remain explicit without filtering indices', () => {
  for (const routes of [undefined, null, {}, 'routes', 2]) assert.equal(extractMapRoutes({ routes }), null)
  assert.deepEqual(extractMapRoutes({ routes: [] }), [])
  const invalidStarts = [
    undefined, null, {}, [], { row: 0 }, { row: '0', col: 0 }, { row: 0, col: false },
    { row: 0.5, col: 1 }, { row: 0, col: -0.5 }, { row: NaN, col: 0 },
    { row: 0, col: Infinity }, { row: Number.MIN_SAFE_INTEGER - 1, col: 0 },
    { row: 0, col: Number.MAX_SAFE_INTEGER + 1 },
  ]
  const routes = [undefined, null, false, 1, [], ...invalidStarts.map((startPosition) => ({ startPosition })),
    { startPosition: { row: 0, col: 0 } }]
  assert.deepEqual(extractMapRoutes({ routes }), [
    null, null, null, null, null, ...invalidStarts.map(() => ({ startPosition: null })),
    { startPosition: { row: 0, col: 0 } },
  ])
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

test('enemy-route summaries join positive main-wave spawns to fixed waits without unused routes or duplicates', () => {
  const routes = [
    { checkpoints: [
      { type: 'MOVE', time: 0 }, { type: 'WAIT_FOR_SECONDS', time: 171.289993 },
      { type: 'WAIT_CURRENT_FRAGMENT_TIME', time: 190 }, { type: 'WAIT_CURRENT_WAVE_TIME', time: 60 },
      { type: 'WAIT_BOSSRUSH_WAVE', time: 1 }, { type: 'WAIT_FOR_SECONDS', time: 0 },
      { type: 'WAIT_FOR_SECONDS', time: 15 }, { type: 'WAIT_FOR_SECONDS', time: 15 },
    ] },
    { checkpoints: [{ type: 'MOVE' }] },
    { checkpoints: [{ type: 'WAIT_FOR_SECONDS', time: 999 }] },
  ]
  const source = level('obt/enemy-routes', [
    spawn('enemy_a', 2, { routeIndex: 0 }), spawn('enemy_a', 3, { routeIndex: 0 }),
    spawn('enemy_a', 1, { routeIndex: 0, hiddenGroup: 'optional' }),
    spawn('enemy_b', 1, { routeIndex: 1 }), spawn('enemy_b', 0, { routeIndex: 2 }),
    { actionType: 'DISPLAY_ENEMY_INFO', key: 'enemy_b', count: 1, routeIndex: 2 },
  ], { routes, branches: { branch: { phases: [{ actions: [spawn('enemy_b', 10, { routeIndex: 2 })] }] } } })
  const unchanged = structuredClone(source)
  const output = buildMapDatabase(options([source], { routes: stage('routes', source.levelId) }))
  const expected = [
    { enemyId: 'enemy_a', routeIndex: 0, fixedWaits: [171.289993, 15, 15], spawnKind: 'fixed', spawnCount: 5, spawnIntervals: null, entrance: null },
    { enemyId: 'enemy_a', routeIndex: 0, fixedWaits: [171.289993, 15, 15], spawnKind: 'conditional', spawnCount: 1, spawnIntervals: [], entrance: null },
    { enemyId: 'enemy_b', routeIndex: 1, fixedWaits: [], spawnKind: 'fixed', spawnCount: 1, spawnIntervals: [], entrance: null },
  ]
  assert.deepEqual(output.index.maps[0].enemyRoutes, expected)
  assert.deepEqual(extractMapEnemyRoutes(source.data), expected)
  assert.deepEqual(source, unchanged)
})

test('unavailable route checkpoints remain unknown while confirmed spawns retain enemy identities', () => {
  const routes = [null, {}, { checkpoints: null }, { checkpoints: {} }, { checkpoints: [null] },
    { checkpoints: [{ type: 'WAIT_FOR_SECONDS', time: NaN }] },
    { checkpoints: [{ type: 'WAIT_FOR_SECONDS', time: -1 }] },
    { checkpoints: [{ type: 'WAIT_FUTURE_MODE', time: 30 }] }]
  const actions = routes.map((_, routeIndex) => spawn('enemy_a', 1, { routeIndex }))
  actions.push(spawn('enemy_a', 1, { routeIndex: 99 }), spawn('enemy_b', 1, { routeIndex: -1 }),
    spawn('enemy_b', 1, { routeIndex: 1.5 }))
  const result = extractMapEnemyRoutes(level('test', actions, { routes }).data)
  assert.deepEqual(result, [
    ...[0, 1, 2, 3, 4, 5, 6, 7, 99].map((routeIndex) =>
      ({ enemyId: 'enemy_a', routeIndex, fixedWaits: null, spawnKind: 'fixed', spawnCount: 1, spawnIntervals: [], entrance: null })),
    { enemyId: 'enemy_b', routeIndex: null, fixedWaits: null, spawnKind: 'fixed', spawnCount: 2, spawnIntervals: [], entrance: null },
  ])
  assert.deepEqual(extractMapEnemyRoutes(level('test', [spawn('enemy_a', 1)]).data), [
    { enemyId: 'enemy_a', routeIndex: null, fixedWaits: null, spawnKind: 'fixed', spawnCount: 1, spawnIntervals: [], entrance: null },
  ])
})

test('enemy-route extraction separates unknown schedules from empty or partially confirmed schedules', () => {
  assert.equal(extractMapEnemyRoutes({}), null)
  assert.equal(extractMapEnemyRoutes({ waves: [{ fragments: null }] }), null)
  assert.deepEqual(extractMapEnemyRoutes({ waves: [] }), [])
  assert.deepEqual(extractMapEnemyRoutes(level('test', [spawn('enemy_a', 0)]).data), [])
  assert.deepEqual(extractMapEnemyRoutes(level('test', [
    spawn('enemy_a', -1), spawn(null, 1), spawn('enemy_a', 1, { routeIndex: 0, futureRuntimeSwitch: true }),
  ], { routes: [{ checkpoints: [] }] }).data), [
    { enemyId: 'enemy_a', routeIndex: 0, fixedWaits: [], spawnKind: 'unknown', spawnCount: 1, spawnIntervals: [], entrance: null },
  ])
})

test('base enemy metadata preserves source classifications, negative weights and three-state immunities', () => {
  const result = buildMapEnemyRegistry({ enemyData: {
    enemy_a: { enemyLevel: 'ELITE', damageType: ['PHYSIC', 'MAGIC', 'PHYSIC'] },
  } }, { enemy_a: [{ level: 0, enemyData: {
    levelType: 'NORMAL', motion: { m_defined: true, m_value: 'FLY' }, applyWay: 'RANGED',
    attributes: {
      moveSpeed: { m_defined: true, m_value: 0 }, baseAttackTime: 2.75, massLevel: -2,
      stunImmune: { m_defined: true, m_value: false }, silenceImmune: true,
      sleepImmune: { m_defined: false, m_value: false }, frozenImmune: 'false',
    },
  } }] })
  assert.deepEqual(result.enemy_a, {
    name: 'enemy_a', hp: null, attack: null, defense: null, resistance: null,
    moveSpeed: 0, attackInterval: 2.75, weight: -2, levelType: 'ELITE', motion: 'FLY', attackWay: 'RANGED',
    damageTypes: ['PHYSIC', 'MAGIC'], immunities: { ...unknownImmunities, stunImmune: false, silenceImmune: true },
  })
  assert.equal(buildMapEnemyRegistry({}, { enemy_a: [{ level: 0, enemyData: {} }] }).enemy_a.immunities, null)
  assert.deepEqual(buildMapEnemyRegistry({ enemyData: { enemy_a: { damageType: [] } } }, {}).enemy_a.damageTypes, [])
  assert.equal(buildMapEnemyRegistry({ enemyData: { enemy_a: { damageType: ['PHYSIC', 3] } } }, {}).enemy_a.damageTypes, null)
})

test('route configured counts and multi-spawn intervals aggregate without losing entrance labels or confirmed groups', () => {
  const source = level('test', [
    spawn('enemy_a', 2, { routeIndex: 0, interval: 0 }), spawn('enemy_a', 3, { routeIndex: 0, interval: 1.25 }),
    spawn('enemy_a', 1, { routeIndex: 0, hiddenGroup: 'optional' }),
    spawn('enemy_a', 1, { routeIndex: 1, interval: Infinity }),
    spawn('enemy_b', 2, { routeIndex: 2 }), spawn('enemy_c', 0, { routeIndex: 3 }),
    spawn('enemy_a', 2, { routeIndex: 0, interval: 2, futureRuntimeSwitch: true }),
    spawn('enemy_a', -1, { routeIndex: 0, futureRuntimeSwitch: true }),
  ], {
    mapData: { map: [[0, 2, 2], [0, 2, 2]], tiles },
    routes: [
      { startPosition: { row: 0, col: 0 }, checkpoints: [] },
      { startPosition: { row: 1, col: 2 }, checkpoints: [] },
      { startPosition: { row: 1, col: 2 }, checkpoints: [] },
      { startPosition: { row: -1, col: 3 }, checkpoints: [] },
    ],
  }).data
  const waves = extractMapWaves(source)
  const mapGeometry = extractMapGeometry(source)
  assert.deepEqual(getMapEntrances({ ...mapGeometry, routes: extractMapRoutes(source), waves })
    .map(({ row, col, label }) => ({ row, col, label })), [
    { row: 1, col: 0, label: 'A' }, { row: 1, col: 2, label: 'B' }, { row: 0, col: 0, label: 'C' },
  ])
  const result = extractMapEnemyRoutes(source)
  assert.deepEqual(result.map(({ enemyId, routeIndex, spawnKind, spawnCount, spawnIntervals, entrance }) =>
    ({ enemyId, routeIndex, spawnKind, spawnCount, spawnIntervals, entrance })), [
    { enemyId: 'enemy_a', routeIndex: 0, spawnKind: 'fixed', spawnCount: 5, spawnIntervals: [0, 1.25], entrance: 'C' },
    { enemyId: 'enemy_a', routeIndex: 0, spawnKind: 'conditional', spawnCount: 1, spawnIntervals: [], entrance: 'C' },
    { enemyId: 'enemy_a', routeIndex: 1, spawnKind: 'fixed', spawnCount: 1, spawnIntervals: [], entrance: 'B' },
    { enemyId: 'enemy_b', routeIndex: 2, spawnKind: 'fixed', spawnCount: 2, spawnIntervals: null, entrance: 'B' },
    { enemyId: 'enemy_a', routeIndex: 0, spawnKind: 'unknown', spawnCount: null, spawnIntervals: null, entrance: 'C' },
  ])
  assert.deepEqual(extractMapEnemySpawnCounts(source), { enemy_a: null, enemy_b: 2, enemy_c: 0 })
})

test('enemy configured totals include conditional settings and preserve unavailable or overflowing counts', () => {
  assert.equal(extractMapEnemySpawnCounts({}), null)
  assert.deepEqual(extractMapEnemySpawnCounts({ waves: [] }), {})
  const source = level('test', [
    spawn('enemy_a', 2, { routeIndex: 0 }), spawn('enemy_a', 3, { routeIndex: 1, hiddenGroup: 'optional' }),
    spawn('enemy_b', 1), spawn('enemy_b', 1.5), spawn('enemy_c', 0),
    { actionType: 'DISPLAY_ENEMY_INFO', key: 'enemy_a', count: 100 },
  ]).data
  assert.deepEqual(extractMapEnemySpawnCounts(source), { enemy_a: 5, enemy_b: null, enemy_c: 0 })
  const overflow = level('test', [spawn('enemy_a', Number.MAX_SAFE_INTEGER), spawn('enemy_a', 1)]).data
  assert.deepEqual(extractMapEnemySpawnCounts(overflow), { enemy_a: null })
  assert.equal(extractMapEnemyRoutes(overflow)[0].spawnCount, null)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getMapCategory, getMapEnvironment, getMapDetail, loadMapDatabase, loadMapDetail, matchesMapFilters, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'
import { getMapSpecifiedSpawnCount } from '../src/lib/mapWaves.ts'
import type { MapDetailShard, MapEnemyRoute, MapFeatureId, MapFilters, MapIndex, MapSummary, MapWave, MapWaveAction } from '../src/types/map.ts'
import { MAP_ENEMY_IMMUNITY_KEYS } from '../src/types/map.ts'

const summary: MapSummary = {
  levelId: 'obt/main/level_main_01-07', stageId: 'main_01-07', code: '1-7', name: '暴君', zoneId: 'main_1',
  zoneName: '第一章 暗黒時代・下', zoneType: 'MAINLINE', status: 'supported', spawnCount: 3, enemyIds: ['enemy_a'], reasons: [], detailFile: 'details-0.json',
}
const index: MapIndex = {
  schemaVersion: 1, generatedAt: '2026-09-30T00:00:00Z', sourceGeneratedAt: null,
  maps: [summary], enemies: { enemy_a: { name: '術師', hp: 1000, attack: 250, defense: 0, resistance: 50 } },
}
const shard: MapDetailShard = {
  schemaVersion: 1, generatedAt: index.generatedAt, maps: {
    [summary.levelId]: {
      levelId: summary.levelId, grid: [[1, 0], [0, 1]], tiles: [
        { tileKey: 'tile_start', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
        { tileKey: 'tile_end', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' },
      ], life: 3, initialCost: 10, deployLimit: 8, enemies: [{ id: 'enemy_a', count: 3 }],
    },
  },
}

test('search combines normalized stage, chapter, enemy names and all specified filters', () => {
  const matches = (query: string, zoneId = 'all', status: 'all' | 'supported' | 'missing' = 'all') =>
    matchesMapFilters(summary, index.enemies, { query, zoneId, status, category: 'all', environment: 'all' })
  assert.equal(matches('１－７ 術師'), true)
  assert.equal(matches('第一章　暴君'), true)
  assert.equal(matches('MAIN_01-07'), true)
  assert.equal(matches('暴君 猟犬'), false)
  assert.equal(matches('暴君', 'main_2'), false)
  assert.equal(matches('暴君', 'main_1', 'missing'), false)
  assert.equal(matches('暴君', 'main_1', 'supported'), true)
})

test('content and environment filters combine with search, zone and data status', () => {
  const filters: MapFilters = { query: '暴君', category: 'main', environment: 'NORMAL', zoneId: 'main_1', status: 'supported' }
  const map = { ...summary, diffGroup: 'NORMAL' }
  assert.equal(matchesMapFilters(map, index.enemies, filters), true)
  for (const patch of [
    { category: 'event' }, { environment: 'TOUGH' }, { zoneId: 'main_2' },
    { status: 'missing' }, { query: '猟犬' },
  ] as Partial<MapFilters>[]) {
    assert.equal(matchesMapFilters(map, index.enemies, { ...filters, ...patch }), false)
  }
  assert.equal(matchesMapFilters(summary, index.enemies, { ...filters, environment: 'none' }), true)
  assert.equal(matchesMapFilters(map, index.enemies, { ...filters, environment: 'none' }), false)
})

test('content classification uses source type, and unknown content remains accessible', () => {
  for (const [zoneType, category] of [
    ['MAINLINE', 'main'], ['ACTIVITY', 'event'], ['MAINLINE_ACTIVITY', 'main'], ['WEEKLY', 'supply'],
    ['CAMPAIGN', 'other'], ['CLIMB_TOWER', 'other'], ['GUIDE', 'other'], ['FUTURE_TYPE', 'other'],
  ]) assert.equal(getMapCategory({ ...summary, zoneType }), category)
  assert.equal(getMapCategory({ ...summary, zoneType: undefined }), 'other')
  assert.equal(getMapCategory({ ...summary, zoneId: 'main_1', zoneType: 'ACTIVITY' }), 'event')
  for (const diffGroup of ['EASY', 'NORMAL', 'TOUGH', 'ALL']) {
    assert.equal(getMapEnvironment({ ...summary, diffGroup }), diffGroup)
  }
  assert.equal(getMapEnvironment({ ...summary, diffGroup: 'NONE' }), 'none')
  assert.equal(getMapEnvironment(summary), 'none')
  assert.equal(getMapEnvironment({ ...summary, diffGroup: 'FUTURE' }), 'other')
  assert.equal(parseMapIndex({ ...index, maps: [{ ...summary, zoneType: undefined }] }).maps[0].zoneType, 'UNKNOWN')
  assert.throws(() => parseMapIndex({ ...index, maps: [{ ...summary, zoneType: 42 }] }))
})

test('feature matching applies any or all to the complete selection across groups, even without a search query', () => {
  const filters: MapFilters = {
    query: '', category: 'all', environment: 'all', zoneId: 'all', status: 'all',
    features: ['periodic_damage', 'hole', 'emp'],
  }
  const candidates: [string, MapFeatureId[] | null | undefined][] = [
    ['environment', ['periodic_damage']], ['terrain', ['hole']], ['device', ['emp']],
    ['two groups', ['hole', 'emp']], ['all groups', ['periodic_damage', 'hole', 'emp']],
    ['unselected', ['grass']], ['none', []], ['unknown', null], ['legacy', undefined],
  ]
  const matched = (featureMatch: MapFilters['featureMatch']) => candidates
    .filter(([, features]) => matchesMapFilters({ ...summary, features }, index.enemies, { ...filters, featureMatch }))
    .map(([name]) => name)
  assert.deepEqual(matched('any'), ['environment', 'terrain', 'device', 'two groups', 'all groups'])
  assert.deepEqual(matched(undefined), matched('any'))
  assert.deepEqual(matched('all'), ['all groups'])
  for (const featureMatch of ['any', 'all'] as const) {
    for (const [, features] of candidates) {
      assert.equal(matchesMapFilters({ ...summary, features }, index.enemies, { ...filters, features: [], featureMatch }), true)
      assert.equal(matchesMapFilters({ ...summary, features }, index.enemies, { ...filters, features: undefined, featureMatch }), true)
    }
  }
})

test('feature matching combines with search, content, environment, zone and status filters', () => {
  const filters: MapFilters = {
    query: '１－７ 術師', category: 'main', environment: 'NORMAL', zoneId: 'main_1', status: 'supported',
    features: ['hole', 'emp'], featureMatch: 'all',
  }
  const map: MapSummary = { ...summary, diffGroup: 'NORMAL', features: ['hole', 'emp'] }
  assert.equal(matchesMapFilters(map, index.enemies, filters), true)
  for (const patch of [
    { category: 'event' }, { environment: 'TOUGH' }, { zoneId: 'main_2' }, { status: 'missing' },
    { query: '猟犬' }, { features: ['hole', 'grass'] },
  ] as Partial<MapFilters>[]) {
    assert.equal(matchesMapFilters(map, index.enemies, { ...filters, ...patch }), false)
  }
  const excluded: MapSummary = { ...map, status: 'excluded', spawnCount: null, reasons: ['conditional-spawn'] }
  assert.equal(matchesMapFilters(excluded, index.enemies, { ...filters, status: 'all' }), true)
})

test('feature parsing distinguishes unavailable data from a checked map without supported features', () => {
  const parse = (map: unknown) => parseMapIndex({ ...index, maps: [map] }).maps[0]
  const features: MapFeatureId[] = ['periodic_damage', 'hole', 'emp']
  const parsed = parse({ ...summary, features })
  assert.deepEqual(parsed.features, features)
  assert.notEqual(parsed.features, features)
  assert.deepEqual(parse({ ...summary, features: [] }).features, [])
  assert.equal(parse({ ...summary, features: null }).features, null)
  assert.equal(parse(summary).features, null)
  assert.deepEqual(parse({ ...summary, status: 'excluded', spawnCount: null, features }).features, features)
  const missing = { ...summary, status: 'missing', spawnCount: null, enemyIds: [], detailFile: null }
  assert.equal(parse(missing).features, null)
  assert.equal(parse({ ...missing, features: null }).features, null)
  assert.throws(() => parse({ ...missing, features: [] }))
  assert.throws(() => parse({ ...missing, features: ['hole'] }))
})

test('feature parsing rejects unknown, duplicate or incorrectly typed feature values', () => {
  for (const features of [
    'hole', 1, true, {}, ['hole', 'hole'], ['future_feature'], ['__proto__'], ['constructor'], ['hole', 1], [null],
  ]) assert.throws(() => parseMapIndex({ ...index, maps: [{ ...summary, features }] }))
})

test('malformed and duplicate map summaries or escaping detail paths are rejected', () => {
  for (const badSummary of [
    { ...summary, detailFile: '../private.json' }, { ...summary, detailFile: 'https://other.example/details-0.json' },
    { ...summary, spawnCount: -1 }, { ...summary, status: 'excluded' }, { ...summary, enemyIds: ['unknown'] },
    { ...summary, enemyIds: ['enemy_a', 'enemy_a'] }, { ...summary, reasons: ['conditional-spawn'] },
  ]) assert.throws(() => parseMapIndex({ ...index, maps: [badSummary] }))
  assert.throws(() => parseMapIndex({ ...index, schemaVersion: 2 }))
  assert.throws(() => parseMapIndex({ ...index, maps: [summary, summary] }))
  assert.equal(parseMapIndex(index).maps[0].code, '1-7')
})

test('optional branch omissions retain their proof without changing legacy or unresolved map status', () => {
  const omittedBranchSpawns = [{ branchId: 'optional', phaseIndex: 0, actionIndex: 1, enemyId: 'enemy_a',
    ruleId: 'optional-device', condition: '装置を作動させずにクリア可能', evidence: ['predefines.tokenInsts[0]'] }]
  const parse = (patch: Partial<MapSummary>) => parseMapIndex({ ...index, maps: [{ ...summary, ...patch }] }).maps[0]
  const parsed = parse({ omittedBranchSpawns })
  assert.deepEqual(parsed.omittedBranchSpawns, omittedBranchSpawns)
  assert.notEqual(parsed.omittedBranchSpawns, omittedBranchSpawns)
  assert.notEqual(parsed.omittedBranchSpawns![0], omittedBranchSpawns[0])
  assert.notEqual(parsed.omittedBranchSpawns![0].evidence, omittedBranchSpawns[0].evidence)
  assert.equal(parsed.status, 'supported')
  assert.deepEqual(parsed.reasons, [])
  assert.equal(parse({}).omittedBranchSpawns, undefined)
  assert.deepEqual(parse({ omittedBranchSpawns: [] }).omittedBranchSpawns, [])
  const unresolved = parse({ status: 'excluded', spawnCount: null, reasons: ['branch-spawn'], omittedBranchSpawns })
  assert.equal(unresolved.status, 'excluded')
  assert.deepEqual(unresolved.reasons, ['branch-spawn'])
  assert.deepEqual(unresolved.omittedBranchSpawns, omittedBranchSpawns)
})

test('aggregation conditions preserve explicit assumptions without changing legacy or lower-bound status', () => {
  const aggregationConditions = ['全WAVEクリア', '抑制ユニットによる追加出現なし']
  const parse = (patch: Record<string, unknown>) => parseMapIndex({ ...index, maps: [{ ...summary, ...patch }] }).maps[0]
  assert.equal(parse({}).aggregationConditions, undefined)
  assert.deepEqual(parse({ aggregationConditions: [] }).aggregationConditions, [])
  const parsed = parse({ aggregationConditions })
  assert.deepEqual(parsed.aggregationConditions, aggregationConditions)
  assert.notEqual(parsed.aggregationConditions, aggregationConditions)
  assert.equal(parsed.status, 'supported')
  assert.equal(parsed.spawnCount, 3)
  const partial = parse({ aggregationConditions, status: 'excluded', spawnCount: null, reasons: ['branch-spawn'],
    spawnAggregation: { kind: 'lower-bound', count: 2, reasons: ['branch-spawn'] } })
  assert.deepEqual(partial.aggregationConditions, aggregationConditions)
  assert.deepEqual(partial.spawnAggregation, { kind: 'lower-bound', count: 2, reasons: ['branch-spawn'] })
  assert.deepEqual(partial.reasons, ['branch-spawn'])
})

test('aggregation conditions reject non-arrays, non-text, blank text, and duplicates', () => {
  for (const aggregationConditions of [null, {}, true, 1, '全WAVEクリア', [null], [1], [''], ['  '], ['\t\n'],
    ['全WAVEクリア', ''], ['全WAVEクリア', '全WAVEクリア']]) {
    assert.throws(() => parseMapIndex({ ...index, maps: [{ ...summary, aggregationConditions }] }), /集計条件/)
  }
})

test('optional branch omissions reject invalid coordinates, missing proof, unknown enemies and duplicate source actions', () => {
  const omission = { branchId: 'optional', phaseIndex: 0, actionIndex: 1, enemyId: 'enemy_a',
    ruleId: 'optional-device', condition: '装置を作動させずにクリア可能', evidence: ['predefines.tokenInsts[0]'] }
  const parse = (omittedBranchSpawns: unknown) => parseMapIndex({ ...index, maps: [{ ...summary, omittedBranchSpawns }] })
  for (const invalid of [null, {}, true, 'optional', [null], [omission, omission]]) assert.throws(() => parse(invalid))
  for (const field of ['phaseIndex', 'actionIndex']) {
    for (const value of [undefined, null, -1, 0.5, '0', Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
      assert.throws(() => parse([{ ...omission, [field]: value }]), `${field}: ${String(value)}`)
    }
  }
  for (const field of ['branchId', 'enemyId', 'ruleId', 'condition']) {
    for (const value of [undefined, null, '', '  ', 0, [], {}]) assert.throws(() => parse([{ ...omission, [field]: value }]))
  }
  for (const evidence of [undefined, null, '', {}, [], [''], ['  '], [1], ['proof', null]]) {
    assert.throws(() => parse([{ ...omission, evidence }]))
  }
  assert.throws(() => parse([{ ...omission, enemyId: 'unknown' }]))
  assert.throws(() => parseMapIndex({ ...index, maps: [{ ...summary, status: 'missing', spawnCount: null,
    enemyIds: [], detailFile: null, omittedBranchSpawns: [omission] }] }))
  assert.equal(parse([omission, { ...omission, actionIndex: 2 }]).maps[0].omittedBranchSpawns?.length, 2)
})

test('enemy attack and defense preserve zero, normalize missing legacy values, and reject invalid stats', () => {
  assert.deepEqual(parseMapIndex(index).enemies.enemy_a, index.enemies.enemy_a)
  const { attack, defense, ...legacy } = index.enemies.enemy_a
  assert.deepEqual(parseMapIndex({ ...index, enemies: { enemy_a: legacy } }).enemies.enemy_a,
    { ...legacy, attack: null, defense: null })
  for (const field of ['attack', 'defense']) {
    for (const value of [-1, '250', NaN, Infinity]) {
      assert.throws(() => parseMapIndex({ ...index, enemies: { enemy_a: { ...index.enemies.enemy_a, [field]: value } } }))
    }
    assert.equal(parseMapIndex({ ...index, enemies: { enemy_a: { ...index.enemies.enemy_a, [field]: null } } }).enemies.enemy_a[field as 'attack' | 'defense'], null)
  }
})

test('shard validation prevents ragged rows, invalid palette references, wrong level ids, and unknown counts', () => {
  const detail = shard.maps[summary.levelId]
  for (const invalid of [
    { ...detail, grid: [[0, 1], [1]] }, { ...detail, grid: [[0, 2]] }, { ...detail, grid: [[-1]] },
    { ...detail, levelId: 'another-map' }, { ...detail, enemies: [{ id: 'enemy_a', count: -1 }] },
  ]) assert.throws(() => parseMapDetailShard({ ...shard, maps: { [summary.levelId]: invalid } }))
  const parsed = parseMapDetailShard(shard)
  assert.deepEqual(parsed.maps[summary.levelId].grid, [[1, 0], [0, 1]])
  assert.equal(getMapDetail(parsed, summary).enemies[0].count, 3)
  assert.throws(() => getMapDetail(parsed, { ...summary, spawnCount: 4 }))
  assert.throws(() => getMapDetail(parsed, { ...summary, status: 'excluded', spawnCount: null }))
})

test('bundled map index and every lazy shard agree; missing and conditional maps never show fabricated counts', async () => {
  const source = new URL('../public/data/maps/', import.meta.url)
  const generated = parseMapIndex(JSON.parse(await readFile(new URL('index.json', source), 'utf8')))
  assert.equal(generated.maps.length, 2298)
  assert.deepEqual(['main', 'event', 'supply', 'other'].map((category) => generated.maps.filter((map) => getMapCategory(map) === category).length), [584, 1416, 35, 263])
  assert.equal(generated.maps.filter((map) => map.status === 'supported').length, 1480)
  assert.equal(generated.maps.filter((map) => map.status === 'excluded').length, 518)
  assert.equal(generated.maps.filter((map) => map.status === 'missing').length, 300)
  const shards = new Map(await Promise.all([...new Set(generated.maps.flatMap((map) => map.detailFile ? [map.detailFile] : []))]
    .map(async (file) => [file, parseMapDetailShard(JSON.parse(await readFile(new URL(file, source), 'utf8')))] as const)))
  assert.equal(shards.size, 16)
  for (const map of generated.maps) {
    if (map.detailFile) {
      const detailFile = shards.get(map.detailFile)!
      assert.equal(detailFile.generatedAt, generated.generatedAt)
      assert.notEqual(getMapDetail(detailFile, map).waves, undefined)
      assert.notEqual(getMapDetail(detailFile, map).routes, undefined)
      assert.ok(Array.isArray(map.features), `${map.stageId}: available maps have checked feature data`)
    } else {
      assert.equal(map.status, 'missing')
      assert.equal(map.spawnCount, null)
      assert.equal(map.features, null)
    }
  }
  const oneSeven = generated.maps.find((map) => map.stageId === 'main_01-07')!
  assert.equal(oneSeven.code, '1-7')
  assert.equal(oneSeven.name, '暴君')
  assert.equal(oneSeven.spawnCount, 41)
  const { name, hp, attack, defense, resistance } = generated.enemies.enemy_1002_nsabr
  assert.deepEqual({ name, hp, attack, defense, resistance },
    { name: '兵士', hp: 1650, attack: 200, defense: 100, resistance: 0 })
  assert.equal(generated.enemies.enemy_1007_slime_2.defense, 0)
  const detail = getMapDetail(shards.get(oneSeven.detailFile!)!, oneSeven)
  assert.equal(detail.grid.length, 7)
  assert.equal(detail.grid[0].length, 11)
  assert.equal(detail.enemies.length, 6)
  assert.ok(Array.isArray(detail.waves))
  assert.equal(getMapSpecifiedSpawnCount(detail.waves.flatMap((wave) => wave.fragments.flatMap((fragment) => fragment.actions))), 41)
  assert.equal(generated.maps.find((map) => map.stageId === 'main_10-04')!.code, '10-5')
  const toughTenFive = generated.maps.find((map) => map.stageId === 'tough_10-04')!
  assert.equal(toughTenFive.spawnCount, 50)
  const toughSpawns = getMapDetail(shards.get(toughTenFive.detailFile!)!, toughTenFive).waves!
    .flatMap((wave) => wave.fragments.flatMap((fragment) => fragment.actions)).filter((action) => action.hiddenGroup === 'fstar')
  assert.equal(toughSpawns.length, 2)
  assert.ok(toughSpawns.every((action) => action.resolution?.status === 'included' && action.resolution.resolvedCount === 1))
  assert.equal(generated.maps.find((map) => map.stageId === 'main_10-04')!.status, 'excluded')
  const nineFive = generated.maps.find((map) => map.stageId === 'main_09-04')!
  assert.equal(nineFive.code, '9-5')
  const nineFiveDetail = getMapDetail(shards.get(nineFive.detailFile!)!, nineFive)
  assert.equal(nineFiveDetail.grid.length, 8)
  assert.equal(nineFiveDetail.grid[0].length, 11)
  assert.equal(nineFiveDetail.routes?.length, 22)
  assert.deepEqual(nineFiveDetail.routes?.map((route) => route?.startPosition), [
    ...Array.from({ length: 4 }, () => ({ row: 6, col: 10 })),
    ...Array.from({ length: 3 }, () => ({ row: 2, col: 0 })),
    { row: 0, col: 0 }, ...Array.from({ length: 2 }, () => ({ row: 2, col: 0 })),
    ...Array.from({ length: 4 }, () => ({ row: 6, col: 10 })),
    ...Array.from({ length: 4 }, () => ({ row: 2, col: 0 })),
    ...Array.from({ length: 4 }, () => ({ row: 6, col: 10 })),
  ])
  for (const [stageId, features] of [
    ['wk_toxic_5', ['periodic_damage']], ['wk_kc_5', ['cost_none']], ['wk_melee_5', ['cost_slow', 'healing']],
    ['main_01-07', ['emp']], ['main_04-04', ['crate', 'infection']], ['tr_08', ['crate']],
    ['act18side_01', ['sp_slow']], ['act18d3_03', []],
  ] as [string, MapFeatureId[]][]) {
    assert.deepEqual(generated.maps.find((map) => map.stageId === stageId)?.features, features, stageId)
  }
})

test('index and detail failures can retry, concurrent readers share one request, and unknown maps do not fetch', async (context) => {
  let indexCalls = 0
  let detailCalls = 0
  context.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    if (String(url).endsWith('index.json')) {
      indexCalls += 1
      return indexCalls === 1 ? new Response('', { status: 500 }) : Response.json(index)
    }
    assert.match(String(url), /data\/maps\/details-0\.json\?v=/)
    detailCalls += 1
    return detailCalls === 1 ? new Response('', { status: 500 }) : Response.json(shard)
  })
  await assert.rejects(loadMapDatabase())
  const [first, second] = await Promise.all([loadMapDatabase(), loadMapDatabase()])
  assert.equal(first, second)
  assert.equal(indexCalls, 2)
  await assert.rejects(loadMapDetail({ ...summary, status: 'missing', detailFile: null, spawnCount: null }))
  assert.equal(detailCalls, 0)
  await assert.rejects(loadMapDetail(summary))
  const [a, b] = await Promise.all([loadMapDetail(summary), loadMapDetail(summary)])
  assert.equal(a, b)
  assert.equal(detailCalls, 2)
  assert.deepEqual(a.grid, [[1, 0], [0, 1]])
})

const waveAction: MapWaveAction = {
  actionType: 'SPAWN', key: 'enemy_a', count: 3, preDelay: 0.1, interval: 0.2, routeIndex: 0,
  hiddenGroup: 'ambush', randomSpawnGroupKey: 'random-group', randomSpawnGroupPackKey: 'pack',
  randomType: 'ALWAYS', refreshType: 'ALWAYS', managedByScheduler: true, blockFragment: false,
  dontBlockWave: true, spawnKind: 'conditional', reasons: ['conditional-spawn'],
}
const wave: MapWave = {
  preDelay: 1, postDelay: 2, maxTimeWaitingForNextWave: -1, advancedWaveTag: 'next',
  fragments: [{ preDelay: 3, actions: [waveAction, {
    ...waveAction, actionType: 'DISPLAY_ENEMY_INFO', count: 3, spawnKind: null, reasons: [],
  }] }],
}
const parseWaves = (waves: unknown) => parseMapDetailShard({
  ...shard, maps: { [summary.levelId]: { ...shard.maps[summary.levelId], waves } },
}).maps[summary.levelId].waves

test('spawn resolution parsing preserves source fields and independently clones condition evidence', () => {
  const resolution = { status: 'included', resolvedEnemyId: 'enemy_b', resolvedCount: 3,
    reasons: [], conditions: ['敵の置き換え'], evidence: ['runes[0]: enemy_a → enemy_b'] }
  const parsed = parseWaves([{ ...wave, fragments: [{ preDelay: 0, actions: [{ ...waveAction, resolution }] }] }])![0].fragments[0].actions[0]
  assert.equal(parsed.key, waveAction.key)
  assert.equal(parsed.count, waveAction.count)
  assert.deepEqual(parsed.resolution, resolution)
  assert.notEqual(parsed.resolution, resolution)
  assert.notEqual(parsed.resolution!.evidence, resolution.evidence)
})

test('spawn resolution parsing rejects contradictory or malformed certainty', () => {
  const resolution = { status: 'included', resolvedEnemyId: 'enemy_a', resolvedCount: 3,
    reasons: [], conditions: [], evidence: [] }
  const parse = (resolution: unknown, actionType = 'SPAWN') => parseWaves([{ ...wave,
    fragments: [{ preDelay: 0, actions: [{ ...waveAction, actionType, spawnKind: actionType === 'SPAWN' ? 'fixed' : null, resolution }] }] }])
  for (const patch of [
    { status: 'future' }, { status: 'excluded', resolvedCount: 3 }, { status: 'unknown', resolvedCount: 3 },
    { resolvedCount: null }, { resolvedCount: -1 }, { resolvedCount: 1.5 }, { resolvedEnemyId: null },
    { resolvedEnemyId: ' ' }, { conditions: 'fixed' }, { evidence: [1] }, { reasons: null },
  ]) assert.throws(() => parse({ ...resolution, ...patch }))
  assert.throws(() => parse(null))
  assert.throws(() => parse(resolution, 'STORY'))
  assert.equal(parse({ ...resolution, status: 'excluded', resolvedCount: 0 })![0].fragments[0].actions[0].resolution!.resolvedCount, 0)
  assert.equal(parse({ ...resolution, status: 'unknown', resolvedCount: null })![0].fragments[0].actions[0].resolution!.status, 'unknown')
})

test('wave parsing distinguishes legacy details, unavailable topology, and known empty schedules', () => {
  const legacy = parseMapDetailShard(shard).maps[summary.levelId]
  assert.equal(legacy.waves, undefined)
  assert.equal(Object.hasOwn(legacy, 'waves'), false)
  assert.equal(parseWaves(null), null)
  assert.deepEqual(parseWaves([]), [])
})

test('wave parsing preserves local timing, raw action order, and conditional or non-SPAWN metadata', () => {
  const parsed = parseWaves([wave])!
  assert.deepEqual(parsed, [wave])
  assert.notEqual(parsed[0], wave)
  assert.notEqual(parsed[0].fragments, wave.fragments)
  assert.notEqual(parsed[0].fragments[0].actions, wave.fragments[0].actions)
  assert.notEqual(parsed[0].fragments[0].actions[0].reasons, waveAction.reasons)
  assert.deepEqual(parsed[0].fragments[0].actions.map((action) => action.actionType), ['SPAWN', 'DISPLAY_ENEMY_INFO'])
  assert.equal(parsed[0].maxTimeWaitingForNextWave, -1)
  const unknowns: MapWave = {
    preDelay: null, postDelay: null, maxTimeWaitingForNextWave: null, advancedWaveTag: null,
    fragments: [{ preDelay: null, actions: [{
      actionType: 'SPAWN', key: null, count: null, preDelay: null, interval: null, routeIndex: null,
      hiddenGroup: null, randomSpawnGroupKey: null, randomSpawnGroupPackKey: null,
      randomType: null, refreshType: null, managedByScheduler: null, blockFragment: null,
      dontBlockWave: null, spawnKind: 'unknown', reasons: ['invalid-spawn-count'],
    }] }],
  }
  assert.deepEqual(parseWaves([unknowns]), [unknowns])
})

test('malformed wave topology and invalid local timing are rejected instead of dropped', () => {
  for (const waves of [
    {}, 'waves', 1, [null], [{}], [{ ...wave, fragments: null }], [{ ...wave, fragments: {} }],
    [{ ...wave, fragments: [null] }], [{ ...wave, fragments: [{ preDelay: 0, actions: {} }] }],
    [{ ...wave, fragments: [{ preDelay: 0, actions: [null] }] }],
    [{ ...wave, preDelay: -1 }], [{ ...wave, preDelay: NaN }], [{ ...wave, postDelay: Infinity }],
    [{ ...wave, maxTimeWaitingForNextWave: -2 }], [{ ...wave, maxTimeWaitingForNextWave: Infinity }],
    [{ ...wave, advancedWaveTag: 42 }], [{ ...wave, fragments: [{ preDelay: -1, actions: [] }] }],
  ]) assert.throws(() => parseWaves(waves))
  assert.deepEqual(parseWaves([{ ...wave, maxTimeWaitingForNextWave: 0.5, fragments: [] }]), [
    { ...wave, maxTimeWaitingForNextWave: 0.5, fragments: [] },
  ])
})

test('wave action validation requires safe integer counts and preserves unknown values only as null', () => {
  for (const patch of [
    { actionType: null }, { key: 0 }, { count: -1 }, { count: 1.5 }, { count: Number.MAX_SAFE_INTEGER + 1 },
    { count: undefined }, { preDelay: undefined }, { preDelay: -0.5 }, { preDelay: NaN },
    { interval: Infinity }, { interval: -1 }, { routeIndex: -1 }, { routeIndex: 1.5 },
    { hiddenGroup: 1 }, { randomSpawnGroupKey: [] }, { randomSpawnGroupPackKey: false },
    { randomType: 0 }, { refreshType: [] }, { managedByScheduler: 0 }, { blockFragment: 'false' },
    { dontBlockWave: undefined }, { spawnKind: 'future' }, { spawnKind: ['fixed'] }, { spawnKind: null },
    { actionType: 'DISPLAY_ENEMY_INFO', spawnKind: 'fixed' }, { reasons: null }, { reasons: [1] },
  ]) {
    assert.throws(() => parseWaves([{ ...wave, fragments: [{ preDelay: 0, actions: [{ ...waveAction, ...patch }] }] }]))
  }
})

const parseRoutes = (routes: unknown) => parseMapDetailShard({
  ...shard, maps: { [summary.levelId]: { ...shard.maps[summary.levelId], routes } },
}).maps[summary.levelId].routes

test('route parsing preserves legacy omission, unknown entries, indices and signed tile coordinates', () => {
  const legacy = parseMapDetailShard(shard).maps[summary.levelId]
  assert.equal(legacy.routes, undefined)
  assert.equal(Object.hasOwn(legacy, 'routes'), false)
  assert.equal(parseRoutes(null), null)
  assert.deepEqual(parseRoutes([]), [])
  const routes = [
    { startPosition: { row: 0, col: 0 } }, null, { startPosition: null },
    { startPosition: { row: -1, col: 10 } },
    { startPosition: { row: Number.MAX_SAFE_INTEGER, col: Number.MIN_SAFE_INTEGER } },
  ]
  const parsed = parseRoutes(routes)!
  assert.deepEqual(parsed, routes)
  assert.notEqual(parsed, routes)
  assert.notEqual(parsed[0], routes[0])
  assert.notEqual(parsed[0]?.startPosition, routes[0]?.startPosition)
  assert.equal(parsed[1], null)
  assert.deepEqual(parsed[3]?.startPosition, { row: -1, col: 10 })
})

test('route parsing rejects malformed topology and coordinates rather than shifting route references', () => {
  for (const routes of [{}, 1, 'routes', [undefined], [false], [1], [[]], [{}]]) {
    assert.throws(() => parseRoutes(routes))
  }
  for (const startPosition of [
    undefined, {}, [], { row: 0 }, { row: 0, col: undefined }, { row: '0', col: 0 },
    { row: 0, col: false }, { row: 0.5, col: 0 }, { row: 0, col: -0.5 },
    { row: NaN, col: 0 }, { row: 0, col: Infinity },
    { row: Number.MAX_SAFE_INTEGER + 1, col: 0 }, { row: 0, col: Number.MIN_SAFE_INTEGER - 1 },
  ]) assert.throws(() => parseRoutes([null, { startPosition }]))
})

test('enemy-route summary parsing preserves fixed wait precision, conditions and independent cloned records', () => {
  const enemyRoutes: MapEnemyRoute[] = [
    { enemyId: 'enemy_a', routeIndex: 0, fixedWaits: [171.289993, 15, 15], spawnKind: 'fixed' },
    { enemyId: 'enemy_a', routeIndex: 0, fixedWaits: [], spawnKind: 'conditional' },
    { enemyId: 'enemy_a', routeIndex: null, fixedWaits: null, spawnKind: 'unknown' },
  ]
  const parsed = parseMapIndex({ ...index, maps: [{ ...summary, enemyRoutes }] }).maps[0].enemyRoutes!
  assert.deepEqual(parsed, enemyRoutes)
  assert.notEqual(parsed, enemyRoutes)
  assert.notEqual(parsed[0], enemyRoutes[0])
  assert.notEqual(parsed[0].fixedWaits, enemyRoutes[0].fixedWaits)
  parsed[0].fixedWaits!.push(20)
  assert.deepEqual(enemyRoutes[0].fixedWaits, [171.289993, 15, 15])
})

test('enemy-route summary parsing separates unavailable legacy or missing sources from known empty spawns', () => {
  const parse = (map: unknown) => parseMapIndex({ ...index, maps: [map] }).maps[0].enemyRoutes
  assert.equal(parse(summary), null)
  assert.equal(parse({ ...summary, enemyRoutes: null }), null)
  assert.deepEqual(parse({ ...summary, enemyRoutes: [] }), [])
  const missing = { ...summary, status: 'missing', spawnCount: null, enemyIds: [], detailFile: null }
  assert.equal(parse(missing), null)
  assert.equal(parse({ ...missing, enemyRoutes: null }), null)
  assert.throws(() => parse({ ...missing, enemyRoutes: [] }))
})

test('enemy-route summary parsing rejects malformed, unknown and duplicate enemy-route records', () => {
  const route = { enemyId: 'enemy_a', routeIndex: 0, fixedWaits: [30], spawnKind: 'fixed' }
  const parse = (enemyRoutes: unknown) => parseMapIndex({ ...index, maps: [{ ...summary, enemyRoutes }] })
  for (const bad of [false, 0, 'routes', {}, [null], [undefined], [[]]]) assert.throws(() => parse(bad))
  for (const patch of [
    { enemyId: undefined }, { enemyId: '' }, { enemyId: ' ' }, { enemyId: 'unknown' }, { enemyId: '__proto__' },
    { routeIndex: undefined }, { routeIndex: -1 }, { routeIndex: 1.5 }, { routeIndex: Infinity },
    { routeIndex: Number.MAX_SAFE_INTEGER + 1 }, { routeIndex: null },
    { fixedWaits: undefined }, { fixedWaits: {} }, { fixedWaits: '30' }, { fixedWaits: [0] },
    { fixedWaits: [-1] }, { fixedWaits: [NaN] }, { fixedWaits: [Infinity] }, { fixedWaits: ['30'] },
    { spawnKind: undefined }, { spawnKind: null }, { spawnKind: 'future' },
  ]) assert.throws(() => parse([{ ...route, ...patch }]), JSON.stringify(patch))
  assert.throws(() => parse([route, { ...route }]))
  assert.throws(() => parse([route, { ...route, fixedWaits: [60] }]))
  const enriched = { ...index, enemies: { ...index.enemies, unused: index.enemies.enemy_a } }
  assert.throws(() => parseMapIndex({ ...enriched, maps: [{ ...summary, enemyRoutes: [{ ...route, enemyId: 'unused' }] }] }))
  assert.deepEqual(parse([{ ...route, fixedWaits: null }]).maps[0].enemyRoutes, [{ ...route, fixedWaits: null }])
})

test('optional base metadata preserves legacy omission, signed weight, classifications and unknown immunities', () => {
  const metadata = { moveSpeed: 0, attackInterval: 2.5, weight: -2, levelType: 'ELITE', motion: 'FLY',
    attackWay: 'ALL', damageTypes: ['PHYSIC', 'MAGIC'], immunities: { stunImmune: false, silenceImmune: true } }
  const parse = (extra: Record<string, unknown>) => parseMapIndex({ ...index,
    enemies: { enemy_a: { ...index.enemies.enemy_a, ...extra } } }).enemies.enemy_a
  const parsed = parse(metadata)
  assert.deepEqual(parsed.damageTypes, metadata.damageTypes)
  assert.notEqual(parsed.damageTypes, metadata.damageTypes)
  assert.deepEqual(parsed.immunities, Object.fromEntries(MAP_ENEMY_IMMUNITY_KEYS.map((key) =>
    [key, key === 'stunImmune' ? false : key === 'silenceImmune' ? true : null])))
  assert.notEqual(parsed.immunities, metadata.immunities)
  assert.equal(parsed.weight, -2)
  assert.equal(parsed.moveSpeed, 0)
  for (const key of Object.keys(metadata)) {
    assert.equal(Object.hasOwn(parse({}), key), false)
    assert.equal(parse({ [key]: null })[key as keyof typeof parsed], null)
  }
})

test('base metadata validation rejects malformed numbers, classifications, damage types and immunity values', () => {
  const parse = (extra: Record<string, unknown>) => parseMapIndex({ ...index,
    enemies: { enemy_a: { ...index.enemies.enemy_a, ...extra } } })
  for (const key of ['moveSpeed', 'attackInterval']) for (const value of [-1, NaN, Infinity, '1', false]) {
    assert.throws(() => parse({ [key]: value }))
  }
  for (const value of [NaN, Infinity, '-2', true]) assert.throws(() => parse({ weight: value }))
  for (const key of ['levelType', 'motion', 'attackWay']) for (const value of ['', ' ', 1, false, []]) {
    assert.throws(() => parse({ [key]: value }))
  }
  for (const value of ['PHYSIC', {}, [''], ['PHYSIC', 1], ['PHYSIC', 'PHYSIC']]) {
    assert.throws(() => parse({ damageTypes: value }))
  }
  for (const value of [[], false, { stunImmune: 0 }, { stunImmune: 'false' }, { stunImmune: undefined }, { futureImmune: true }]) {
    assert.throws(() => parse({ immunities: value }))
  }
})

test('optional route counts, intervals and entrances preserve legacy omission and cloned source precision', () => {
  const route: MapEnemyRoute = { enemyId: 'enemy_a', routeIndex: 0, fixedWaits: [], spawnKind: 'fixed',
    spawnCount: 5, spawnIntervals: [0, 1.25, 1.25], entrance: 'AA' }
  const parse = (route: unknown) => parseMapIndex({ ...index, maps: [{ ...summary, enemyRoutes: [route] }] }).maps[0].enemyRoutes![0]
  const parsed = parse(route)
  assert.deepEqual(parsed, route)
  assert.notEqual(parsed.spawnIntervals, route.spawnIntervals)
  const { spawnCount, spawnIntervals, entrance, ...legacy } = route
  assert.deepEqual(parse(legacy), legacy)
  for (const key of ['spawnCount', 'spawnIntervals', 'entrance']) {
    assert.equal(parse({ ...legacy, [key]: null })[key as keyof MapEnemyRoute], null)
  }
  for (const patch of [
    { spawnCount: -1 }, { spawnCount: 1.5 }, { spawnCount: Infinity }, { spawnCount: '5' },
    { spawnCount: Number.MAX_SAFE_INTEGER + 1 }, { spawnIntervals: {} }, { spawnIntervals: [-1] },
    { spawnIntervals: [NaN] }, { spawnIntervals: [Infinity] }, { spawnIntervals: [null] }, { spawnIntervals: ['1'] },
    { entrance: '' }, { entrance: 'a' }, { entrance: 'A1' }, { entrance: 1 },
    { routeIndex: null, fixedWaits: null, entrance: 'A' },
  ]) assert.throws(() => parse({ ...route, ...patch }))
})

test('enemy configured-count parsing preserves unknown totals and rejects unsupported identities or invalid counts', () => {
  const parse = (enemySpawnCounts: unknown, map: MapSummary = summary) =>
    parseMapIndex({ ...index, maps: [{ ...map, enemySpawnCounts }] }).maps[0].enemySpawnCounts
  assert.equal(parse(undefined), null)
  assert.equal(parse(null), null)
  assert.deepEqual(parse({}), {})
  const counts = { enemy_a: 0 }
  assert.deepEqual(parse(counts), counts)
  assert.notEqual(parse(counts), counts)
  assert.deepEqual(parse({ enemy_a: null }), { enemy_a: null })
  for (const counts of [[], 0, false, { unknown: 3 }, { enemy_a: undefined }, { enemy_a: -1 },
    { enemy_a: 1.5 }, { enemy_a: Infinity }, { enemy_a: NaN }, { enemy_a: '3' }, { enemy_a: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => parse(counts))
  }
  assert.throws(() => parse({}, { ...summary, status: 'missing', spawnCount: null, enemyIds: [], detailFile: null }))
})

test('branch evidence distinguishes non-enemies and mandatory counts without changing old indexes', () => {
  const entry = { branchId: 'b', phaseIndex: 0, actionIndex: 0, enemyId: 'enemy_a',
    ruleId: 'reviewed-rule', condition: '条件', evidence: ['source'] }
  const parsed = parseMapIndex({ ...index, maps: [{ ...summary,
    omittedBranchSpawns: [{ ...entry, kind: 'non-enemy' }],
    countedBranchSpawns: [{ ...entry, branchId: 'c', count: 2 }],
  }] }).maps[0]
  assert.equal(parsed.omittedBranchSpawns?.[0].kind, 'non-enemy')
  assert.equal(parsed.countedBranchSpawns?.[0].count, 2)
  assert.equal(parseMapIndex(index).maps[0].countedBranchSpawns, undefined)
  for (const count of [-1, 1.5, Infinity, '1', undefined]) {
    assert.throws(() => parseMapIndex({ ...index, maps: [{ ...summary, countedBranchSpawns: [{ ...entry, count }] }] }))
  }
  assert.throws(() => parseMapIndex({ ...index, maps: [{ ...summary, omittedBranchSpawns: [{ ...entry, kind: 'unknown' }] }] }))
})

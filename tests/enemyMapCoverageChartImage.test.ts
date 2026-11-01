import test from 'node:test'
import assert from 'node:assert/strict'
import { createEnemyMapCoverageChartSnapshot, getMapCoverageSegmentCount,
  MAP_COVERAGE_STATUS_KEYS, MAP_COVERAGE_STATUS_LABELS, MAP_COVERAGE_COLORS } from '../src/lib/enemyMapCoverageChartImage.ts'
import { withChartImageAspect } from '../src/lib/chartImageFilename.ts'
import type { MapSummary } from '../src/types/map.ts'

const base: MapSummary = {
  levelId: 'normal', stageId: 'normal', code: '1-1', name: 'テスト',
  zoneId: 'main_1', zoneName: '第一章', zoneType: 'MAINLINE',
  status: 'supported', spawnCount: 1, enemyIds: [], reasons: [], detailFile: 'details-0.json',
}

test('image snapshots preserve four categories and deduplicated coverage for their selected mode', () => {
  const maps: MapSummary[] = [base, { ...base, stageId: 'alias' },
    { ...base, levelId: 'uncertain', status: 'excluded', spawnCount: null },
    { ...base, levelId: 'missing', status: 'missing', spawnCount: null, detailFile: null },
    { ...base, levelId: 'event', zoneId: 'event', zoneType: 'ACTIVITY' },
    { ...base, levelId: 'other', zoneId: 'other', zoneType: 'CAMPAIGN' }]
  const spawns = createEnemyMapCoverageChartSnapshot(maps, 'SPAWNS')
  const appearances = createEnemyMapCoverageChartSnapshot(maps, 'MAPS')
  assert.deepEqual(spawns.categories.map(({ key }) => key), ['main', 'event', 'supply', 'other'])
  assert.deepEqual(spawns.totals, { total: 5, included: 2, regular: 2, conditional: 0, excluded: 1, story: 0, pending: 1, missing: 1 })
  assert.deepEqual(appearances.totals, { total: 5, included: 3, regular: 3, conditional: 0, excluded: 1, story: 0, pending: 0, missing: 1 })
  assert.deepEqual(spawns.categories[2], { key: 'supply', label: '物資調達・SoC', total: 0, included: 0, regular: 0, conditional: 0, excluded: 0, story: 0, pending: 0, missing: 0 })
  const captured = structuredClone(spawns)
  maps[2].status = 'supported'
  maps.push({ ...base, levelId: 'later' })
  appearances.categories[0].included = 999
  appearances.totals.included = 999
  assert.deepEqual(spawns, captured)
})

test('exported segments separate story environments from other exclusions and data readiness', () => {
  const maps: MapSummary[] = [base,
    { ...base, levelId: 'story-ready', diffGroup: 'EASY' },
    { ...base, levelId: 'story-pending', diffGroup: 'EASY', status: 'excluded', spawnCount: null, reasons: ['branch-spawn'] },
    { ...base, levelId: 'story-missing', diffGroup: 'EASY', status: 'missing', spawnCount: null, detailFile: null },
    { ...base, levelId: 'other-ready', zoneType: 'CAMPAIGN' },
    { ...base, levelId: 'other-pending', zoneType: 'CAMPAIGN', status: 'excluded', spawnCount: null, reasons: ['branch-spawn'] },
    { ...base, levelId: 'lower-bound', status: 'excluded', spawnCount: null, reasons: ['branch-spawn'],
      spawnAggregation: { kind: 'lower-bound', count: 3, reasons: ['branch-spawn'] } },
  ]
  const snapshot = createEnemyMapCoverageChartSnapshot(maps, 'SPAWNS')
  assert.deepEqual(snapshot.totals, { total: 7, included: 2, regular: 1, conditional: 1, excluded: 1, story: 3, pending: 1, missing: 0, lowerBound: 1 })
  assert.deepEqual(createEnemyMapCoverageChartSnapshot(maps, 'MAPS').totals, {
    total: 7, included: 2, regular: 2, conditional: 0, excluded: 2, story: 3, pending: 0, missing: 0,
  })
  assert.equal(MAP_COVERAGE_STATUS_KEYS.reduce((sum, key) => sum + getMapCoverageSegmentCount(snapshot.totals, key), 0), snapshot.totals.total)
  for (const category of snapshot.categories) {
    assert.equal(MAP_COVERAGE_STATUS_KEYS.reduce((sum, key) => sum + getMapCoverageSegmentCount(category, key), 0), category.total)
  }
  assert.deepEqual(MAP_COVERAGE_STATUS_KEYS, ['included', 'conditional', 'excluded', 'story', 'pending', 'missing'])
  assert.deepEqual(MAP_COVERAGE_STATUS_LABELS, {
    included: '通常の集計対象', conditional: '条件付き集計対象', excluded: '集計対象外', story: '物語環境・対象外', pending: '解析保留', missing: 'データ未取得',
  })
  assert.deepEqual(MAP_COVERAGE_COLORS, {
    included: '#417897', conditional: '#8fb6cc', excluded: '#719674', story: '#9278ab', pending: '#ad7c49', missing: '#d0d0d0',
  })
})

test('a stacked export divides included maps into regular and conditional without counting either twice', () => {
  const optionalSpawn = {
    branchId: 'reinforcements', phaseIndex: 0, actionIndex: 0, enemyId: 'enemy_a',
    ruleId: 'optional-spawn', condition: '任意の追加出現', evidence: ['trigger can be avoided'],
  }
  const lowerBound: MapSummary = { ...base, levelId: 'lower-bound', status: 'excluded', spawnCount: null,
    reasons: ['branch-spawn'], spawnAggregation: { kind: 'lower-bound', count: 3, reasons: ['branch-spawn'] } }
  const maps: MapSummary[] = [base,
    lowerBound,
    { ...base, levelId: 'optional', omittedBranchSpawns: [optionalSpawn] },
    { ...lowerBound, levelId: 'lower-and-optional', omittedBranchSpawns: [optionalSpawn] },
    { ...base, levelId: 'non-enemy', omittedBranchSpawns: [{ ...optionalSpawn, kind: 'non-enemy' }] },
    { ...base, levelId: 'mandatory', countedBranchSpawns: [{ ...optionalSpawn, count: 2 }] },
    { ...base, levelId: 'non-enemy', stageId: 'alias' },
  ]
  const spawns = createEnemyMapCoverageChartSnapshot(maps, 'SPAWNS')
  assert.deepEqual(spawns.totals, {
    total: 6, included: 6, regular: 3, conditional: 3,
    excluded: 0, story: 0, pending: 0, missing: 0, lowerBound: 2,
  })
  assert.equal(getMapCoverageSegmentCount(spawns.totals, 'included'), 3)
  assert.equal(getMapCoverageSegmentCount(spawns.totals, 'conditional'), 3)
  assert.equal(spawns.totals.regular + spawns.totals.conditional, spawns.totals.included)
  assert.equal(MAP_COVERAGE_STATUS_KEYS.reduce((sum, status) => sum + getMapCoverageSegmentCount(spawns.totals, status), 0), 6)
  const appearances = createEnemyMapCoverageChartSnapshot(maps, 'MAPS')
  assert.deepEqual(appearances.totals, {
    total: 6, included: 6, regular: 6, conditional: 0,
    excluded: 0, story: 0, pending: 0, missing: 0,
  })
  assert.equal(getMapCoverageSegmentCount(appearances.totals, 'included'), 6)
  assert.equal(getMapCoverageSegmentCount(appearances.totals, 'conditional'), 0)
})

test('conditions on out-of-scope maps do not enter either included segment', () => {
  const lowerBound: MapSummary = { ...base, status: 'excluded', spawnCount: null,
    reasons: ['branch-spawn'], spawnAggregation: { kind: 'lower-bound', count: 3, reasons: ['branch-spawn'] } }
  const maps = [
    { ...lowerBound, levelId: 'other-lower', zoneType: 'CAMPAIGN' },
    { ...lowerBound, levelId: 'story-lower', diffGroup: 'EASY' },
  ]
  for (const mode of ['SPAWNS', 'MAPS'] as const) {
    const snapshot = createEnemyMapCoverageChartSnapshot(maps, mode)
    assert.deepEqual(snapshot.totals, {
      total: 2, included: 0, regular: 0, conditional: 0,
      excluded: 1, story: 1, pending: 0, missing: 0,
    })
    assert.equal(MAP_COVERAGE_STATUS_KEYS.reduce((sum, status) => sum + getMapCoverageSegmentCount(snapshot.totals, status), 0), 2)
  }
})

test('automatic filenames describe aggregation and representation without depending on result counts', () => {
  const spawns = createEnemyMapCoverageChartSnapshot([base], 'SPAWNS')
  const appearances = createEnemyMapCoverageChartSnapshot([base], 'MAPS')
  assert.equal(spawns.filename, '集計マップ_出現回数_分類別_100%横積上げ.png')
  assert.equal(appearances.filename, '集計マップ_登場マップ数_分類別_100%横積上げ.png')
  assert.equal(createEnemyMapCoverageChartSnapshot([], 'SPAWNS').filename, spawns.filename)
  assert.equal(withChartImageAspect(spawns.filename), '集計マップ_出現回数_分類別_100%横積上げ_比率自動.png')
  assert.equal(withChartImageAspect(spawns.filename, 16 / 9), '集計マップ_出現回数_分類別_100%横積上げ_比率16x9.png')
})

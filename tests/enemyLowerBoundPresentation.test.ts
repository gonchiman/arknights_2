import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMapIndex } from '../src/lib/mapDatabase.ts'
import { parseEnemyHistogramCounts, getEnemySpawnCoverageLabel } from '../src/lib/enemyHistogramCounts.ts'
import { getMapCoverageReasons, getMapCoverageStatus, getMapCoverageStatusLabel, summarizeMapCoverage } from '../src/lib/enemyMapCoverage.ts'
import { createEnemyMapCoverageChartSnapshot } from '../src/lib/enemyMapCoverageChartImage.ts'
import { createEnemyHistogramSnapshot, parseEnemyHistogramSnapshot } from '../src/lib/enemyHistogramSnapshot.ts'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { buildEnemyJointDistribution } from '../src/lib/enemyJointDistribution.ts'
import { getEnemyJointImageConditions } from '../src/lib/enemyJointImage.ts'
import type { MapSummary } from '../src/types/map.ts'

const partial: MapSummary = {
  levelId: 'obt/main/level_main_09-01', stageId: 'main_09-01', code: '9-1', name: '分岐のある作戦',
  zoneId: 'main_9', zoneName: '第九章', zoneType: 'MAINLINE', diffGroup: 'NORMAL',
  status: 'excluded', spawnCount: null, enemyIds: ['enemy_a'], reasons: ['branch-spawn'], detailFile: 'details-0.json',
  spawnAggregation: { kind: 'lower-bound', count: 40, reasons: ['branch-spawn'] },
}
const index = {
  schemaVersion: 1, generatedAt: '2026-10-28T00:00:00Z', sourceGeneratedAt: null,
  maps: [partial], enemies: { enemy_a: { name: '敵', hp: 1000, attack: 100, defense: 50, resistance: 10 } },
}
const histogram = {
  schemaVersion: 1, generatedAt: index.generatedAt, sourceGeneratedAt: null,
  spawnAggregationMode: 'lower-bound',
  summary: { mapCount: 2, missingMapCount: 1, spawnMapCount: 2, spawnExcludedMapCount: 0, lowerBoundMapCount: 1 },
  enemies: { enemy_a: { mapCount: 2, spawnCount: 50 } },
  diagnostics: { lowerBoundLevels: [{ levelId: partial.levelId, spawnCount: 40, reasons: ['branch-spawn'] }] },
}

test('lower-bound metadata is retained without asserting a complete map total', () => {
  const result = parseMapIndex(index).maps[0]
  assert.equal(result.status, 'excluded')
  assert.equal(result.spawnCount, null)
  assert.deepEqual(result.spawnAggregation, partial.spawnAggregation)
  assert.equal(getMapCoverageStatus(result, 'SPAWNS'), 'included')
  assert.equal(getMapCoverageStatusLabel(result, 'SPAWNS'), '下限集計')
  assert.deepEqual(getMapCoverageReasons(result, 'SPAWNS'), ['確定出現分のみ集計', '分岐に応じた出現指定'])
})

test('a positive lower bound cannot bypass missing, story or out-of-scope maps', () => {
  for (const map of [
    { ...partial, diffGroup: 'EASY' },
    { ...partial, zoneType: 'CAMPAIGN' },
  ]) {
    assert.equal(getMapCoverageStatus(map, 'SPAWNS'), 'excluded')
    assert.equal(summarizeMapCoverage([map], 'SPAWNS').lowerBound, undefined)
  }
  assert.equal(getMapCoverageStatus({ ...partial, status: 'missing' }, 'SPAWNS'), 'missing')
  assert.equal(getMapCoverageStatus({ ...partial, spawnAggregation: { ...partial.spawnAggregation!, count: 0 } }, 'SPAWNS'), 'excluded')
  assert.equal(getMapCoverageStatus({ ...partial, spawnAggregation: undefined }, 'SPAWNS'), 'excluded')
})

test('lower-bound coverage is a subset of included maps and is not double counted', () => {
  const complete: MapSummary = { ...partial, levelId: 'complete', status: 'supported', spawnCount: 10, reasons: [], spawnAggregation: undefined }
  const summary = summarizeMapCoverage([partial, partial, complete], 'SPAWNS')
  assert.deepEqual(summary, { total: 2, included: 2, excluded: 0, missing: 0, lowerBound: 1 })
  assert.deepEqual(summarizeMapCoverage([partial, complete], 'MAPS'), { total: 2, included: 2, excluded: 0, missing: 0 })
  assert.equal(getMapCoverageStatusLabel(partial, 'MAPS'), '集計対象')
  assert.deepEqual(getMapCoverageReasons(partial, 'MAPS'), ['マップデータ取得済み'])
  const snapshot = createEnemyMapCoverageChartSnapshot([partial, complete], 'SPAWNS')
  assert.equal(snapshot.totals.lowerBound, 1)
  assert.equal(snapshot.categories.find(category => category.key === 'main')!.lowerBound, 1)
})

test('map parser rejects invalid partial totals and inconsistent reasons/status', () => {
  for (const spawnAggregation of [
    null, { ...partial.spawnAggregation, kind: 'complete' },
    ...[0, -1, 1.5, '40', Number.MAX_SAFE_INTEGER + 1].map(count => ({ ...partial.spawnAggregation, count })),
    ...[[], [''], ['branch-spawn', 'branch-spawn'], ['random-spawn-group']].map(reasons => ({ ...partial.spawnAggregation, reasons })),
  ]) assert.throws(() => parseMapIndex({ ...index, maps: [{ ...partial, spawnAggregation }] }))
  assert.throws(() => parseMapIndex({ ...index, maps: [{ ...partial, status: 'supported', spawnCount: 40, reasons: [] }] }))
  assert.throws(() => parseMapIndex({ ...index, maps: [{ ...partial, status: 'missing', enemyIds: [], detailFile: null }] }))
})

test('histogram parser preserves the aggregation mode and lower-bound diagnostics', () => {
  const result = parseEnemyHistogramCounts(histogram)
  assert.equal(result.spawnAggregationMode, 'lower-bound')
  assert.equal(result.summary.lowerBoundMapCount, 1)
  assert.deepEqual(result.diagnostics, histogram.diagnostics)
  assert.equal(getEnemySpawnCoverageLabel(result.summary), '集計対象 2マップ（下限 1）')
})

test('histogram parser rejects lower-bound metadata count mismatches and invalid provenance', () => {
  for (const source of [
    { ...histogram, spawnAggregationMode: undefined },
    { ...histogram, spawnAggregationMode: 'unknown' },
    { ...histogram, diagnostics: undefined },
    { ...histogram, summary: { ...histogram.summary, lowerBoundMapCount: 0 } },
    { ...histogram, summary: { ...histogram.summary, lowerBoundMapCount: 3 } },
    { ...histogram, summary: { ...histogram.summary, lowerBoundMapCount: 2 }, diagnostics: { lowerBoundLevels: [...histogram.diagnostics.lowerBoundLevels, ...histogram.diagnostics.lowerBoundLevels] } },
    ...[0, -1, 1.5, '40'].map(spawnCount => ({ ...histogram, diagnostics: { lowerBoundLevels: [{ ...histogram.diagnostics.lowerBoundLevels[0], spawnCount }] } })),
    ...[[], [''], ['branch-spawn', 'branch-spawn']].map(reasons => ({ ...histogram, diagnostics: { lowerBoundLevels: [{ ...histogram.diagnostics.lowerBoundLevels[0], reasons }] } })),
  ]) assert.throws(() => parseEnemyHistogramCounts(source))
})

test('legacy and complete-only exports retain their complete-count label', () => {
  const { lowerBoundMapCount: _lower, ...summary } = histogram.summary
  const { spawnAggregationMode: _mode, diagnostics: _diagnostics, ...old } = histogram
  const legacy = parseEnemyHistogramCounts({ ...old, summary })
  assert.equal(legacy.spawnAggregationMode, undefined)
  assert.equal(legacy.diagnostics, undefined)
  assert.equal(getEnemySpawnCoverageLabel(legacy.summary), '出現数確定 2マップ')
  const complete = parseEnemyHistogramCounts({ ...histogram, summary: { ...summary, lowerBoundMapCount: 0 }, diagnostics: { lowerBoundLevels: [] } })
  assert.equal(getEnemySpawnCoverageLabel(complete.summary), '出現数確定 2マップ')
})

test('saved distributions preserve lower-bound coverage and reject an impossible subset', () => {
  const coverage = parseEnemyHistogramCounts(histogram).summary
  const snapshot = createEnemyHistogramSnapshot({
    metric: 'magicResistance', source: { scopeLabel: '全敵', enemyIds: ['enemy_a'], countGeneratedAt: null },
    countMode: 'SPAWNS', coverage, scale: 'LINEAR',
    statistics: calculateWeightedHistogram([{ value: 10, weight: 50 }]),
    ratingBins: null, customLinearUpperBound: null, showPercentages: false, showBinRanges: false,
    referenceVisibility: { mean: false, median: false },
  })
  const restored = parseEnemyHistogramSnapshot(JSON.parse(JSON.stringify(snapshot)))!
  assert.equal(restored.coverage?.lowerBoundMapCount, 1)
  assert.equal(getEnemySpawnCoverageLabel(restored.coverage), '集計対象 2マップ（下限 1）')
  for (const lowerBoundMapCount of [-1, 0.5, 3, '1']) {
    assert.equal(parseEnemyHistogramSnapshot({ ...snapshot, coverage: { ...coverage, lowerBoundMapCount } }), null)
  }
  const conditions = getEnemyJointImageConditions(buildEnemyJointDistribution([], 'SPAWNS'), '全敵', coverage)
  assert.match(conditions, /集計対象 2マップ（下限 1）/)
  assert.doesNotMatch(conditions, /出現数確定/)
})

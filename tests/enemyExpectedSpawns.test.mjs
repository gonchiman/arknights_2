import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeEnemySpawns } from '../scripts/lib/enemySpawnConditions.mjs'
import { resolveEnemySpawnAggregation } from '../scripts/lib/enemySpawnAggregation.mjs'
import { buildEnemyHistogramCounts } from '../scripts/generateEnemyHistogramCounts.mjs'
import { buildMapDatabase } from '../scripts/generateMapDatabase.mjs'
import { RANDOM_SPAWN_SOURCE_REVISION as sourceRevision } from '../scripts/lib/randomSpawnPolicy.mjs'
import { parseEnemyHistogramCounts, getEnemySpawnCoverageLabel, buildEnemyHistogramObservations } from '../src/lib/enemyHistogramCounts.ts'
import { parseMapIndex } from '../src/lib/mapDatabase.ts'
import { getMapCoverageDisplayStatus, getMapCoverageReasons } from '../src/lib/enemyMapCoverage.ts'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'

const levelId = 'activities/act1multi/level_act1multi_06'
const context = { levelId, sourceRevision, difficulty: 'NORMAL', diffGroup: 'NONE' }
const spawn = (key, count, weight, extra = {}) => ({ actionType: 'SPAWN', key, count,
  managedByScheduler: true, weight, randomSpawnGroupKey: 'choice', ...extra })
const level = actions => ({ enemyDbRefs: [...new Set(actions.map(a => a.key))].map(id => ({ id, useDb: true, level: 0 })),
  mapData: { map: [[0]], tiles: [{ tileKey: 'tile_start', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' }] },
  waves: [{ fragments: [{ actions }] }] })

test('disjoint random packs contribute fractional expectations, never rounded counts or summed alternatives', () => {
  const source = level([spawn('a', 1, 1), spawn('b', 2, 3)])
  assert.equal(resolveEnemySpawnAggregation(source, context, { mode: 'lower-bound' }).kind, 'excluded')
  const result = resolveEnemySpawnAggregation(source, context, { mode: 'expected-lower-bound' })
  assert.equal(result.kind, 'expected-lower-bound')
  assert.deepEqual([...result.counts], [['a', 0.25], ['b', 1.5]])
  assert.equal(result.count, 1.75)
  const fixedAfterRandom = structuredClone(source)
  fixedAfterRandom.waves[0].fragments.push({ actions: [spawn('a', 2, 0, { randomSpawnGroupKey: null })] })
  assert.equal(resolveEnemySpawnAggregation(fixedAfterRandom, context, { mode: 'expected-lower-bound' }).count, 3.75)
  assert.equal(resolveEnemySpawnAggregation(source, context).kind, 'excluded')
})

test('unknown candidates and branches remain omitted without renormalizing probabilities', () => {
  const source = level([spawn('a', 1, 1), spawn('b', 3, 3, { hiddenGroup: 'inactive' })])
  source.branches = { optional: { phases: [{ actions: [spawn('extra', 20, 0, { randomSpawnGroupKey: null })] }] } }
  const result = resolveEnemySpawnAggregation(source, context, { mode: 'expected-lower-bound' })
  assert.equal(result.count, 0.25)
  assert.ok(result.reasons.includes('branch-spawn'))
  assert.equal(result.counts.has('b'), false)
  assert.equal(result.counts.has('extra'), false)
  assert.equal(resolveEnemySpawnAggregation(source, { ...context, sourceRevision: 'unknown' }, { mode: 'expected-lower-bound' }).kind, 'excluded')
})

test('expected context or cached analysis cannot leak into guaranteed lower-bound mode', () => {
  const source = level([spawn('a', 2, 1), spawn('b', 2, 1)])
  const expectedContext = { ...context, randomSpawnMode: 'expected' }
  const analysis = analyzeEnemySpawns(source, expectedContext)
  for (const mode of ['lower-bound', 'strict']) {
    assert.equal(resolveEnemySpawnAggregation(source, expectedContext, { mode }).kind, 'excluded')
    assert.equal(resolveEnemySpawnAggregation(source, context, { mode, analysis }).kind, 'excluded')
  }
})

test('fractional non-enemy contributions are removed using the same reviewed role policy', () => {
  const source = level([spawn('enemy_3001_upeopl', 1, 1), spawn('hostile', 1, 3)])
  const result = resolveEnemySpawnAggregation(source, context, { mode: 'expected-lower-bound' })
  assert.equal(result.count, 0.75)
  assert.equal(result.counts.get('enemy_3001_upeopl'), 0)
  assert.equal(result.excludedNonEnemySpawns[0].count, 0.25)
  const civiliansOnly = level([spawn('enemy_3001_upeopl', 1, 1), spawn('enemy_1313_wdfmr', 1, 2),
    spawn('enemy_3002_ftrtal', 1, 3), { ...spawn('', 0, 4), actionType: 'EMPTY' }])
  assert.equal(resolveEnemySpawnAggregation(civiliansOnly, context, { mode: 'expected-lower-bound' }).kind, 'excluded')
})

test('map coverage, histogram and weighted statistics share the expected counts and label them explicitly', () => {
  const source = level([spawn('a', 1, 1), spawn('b', 2, 3)])
  const levels = [{ levelId, data: source }]
  const stage = { stageId: 'ig', levelId, code: 'IG-10', name: 'test', zoneId: 'act1multi_zone1',
    difficulty: 'NORMAL', diffGroup: 'NONE', isStoryOnly: false }
  const raw = buildEnemyHistogramCounts(levels, { spawnAggregationMode: 'expected-lower-bound', sourceRevision,
    stageContexts: { [levelId]: stage } })
  const counts = parseEnemyHistogramCounts(raw)
  assert.equal(counts.summary.expectedMapCount, 1)
  assert.equal(counts.summary.lowerBoundMapCount, 0)
  assert.match(getEnemySpawnCoverageLabel(counts.summary), /期待値 1/)
  const maps = buildMapDatabase({ levels, stageTable: { stages: { ig: stage } },
    zoneTable: { zones: { act1multi_zone1: { type: 'ACTIVITY', zoneNameFirst: 'IG' } } },
    handbook: { enemyData: {} }, database: {}, sourceRevision, spawnAggregationMode: 'expected-lower-bound' })
  const map = parseMapIndex(maps.index).maps[0]
  assert.equal(getMapCoverageDisplayStatus(map, 'SPAWNS'), 'conditional')
  assert.match(getMapCoverageReasons(map, 'SPAWNS').join(' '), /期待値/)
  assert.equal(map.spawnAggregation.count, 1.75)
  assert.deepEqual(counts.diagnostics.aggregationConditions, [{ levelId, conditions: map.aggregationConditions }])
  const observations = buildEnemyHistogramObservations([{ id: 'a' }, { id: 'b' }], e => e.id === 'a' ? 20 : 60, 'SPAWNS', counts)
  const statistics = calculateWeightedHistogram(observations)
  assert.equal(statistics.count, 1.75)
  assert.equal(statistics.mean, (20 * 0.25 + 60 * 1.5) / 1.75)
  for (const mutate of [
    d => { d.spawnAggregationMode = 'lower-bound' },
    d => { d.summary.expectedMapCount = 0 },
    d => { d.diagnostics.expectedLevels[0].spawnCount = Infinity },
    d => { d.enemies.a.spawnCount = -0.25 },
  ]) {
    const bad = structuredClone(raw); mutate(bad)
    assert.throws(() => parseEnemyHistogramCounts(bad))
  }
})

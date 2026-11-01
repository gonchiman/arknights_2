import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeEnemySpawns } from '../scripts/lib/enemySpawnConditions.mjs'
import { resolveEnemySpawnAggregation } from '../scripts/lib/enemySpawnAggregation.mjs'
import { buildEnemyHistogramCounts } from '../scripts/generateEnemyHistogramCounts.mjs'
import { buildMapDatabase } from '../scripts/generateMapDatabase.mjs'
import { RANDOM_SPAWN_SOURCE_REVISION } from '../scripts/lib/randomSpawnPolicy.mjs'

const context = { levelId: 'activities/act1multi/level_act1multi_01', sourceRevision: RANDOM_SPAWN_SOURCE_REVISION,
  difficulty: 'NORMAL', diffGroup: 'NONE' }
const spawn = (key, count, extra = {}) => ({ actionType: 'SPAWN', key, count, managedByScheduler: true, ...extra })
const candidate = (key, count, pack, extra = {}) => spawn(key, count, {
  randomSpawnGroupKey: 'choose', randomSpawnGroupPackKey: pack, weight: 50, ...extra,
})
const level = actions => ({ enemyDbRefs: [...new Set(actions.map(action => action.key))].map(id => ({ id, useDb: true, level: 0 })),
  mapData: { map: [[0]], tiles: [{ tileKey: 'tile_start', heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL' }] },
  waves: [{ fragments: [{ actions }] }] })
const aggregate = source => resolveEnemySpawnAggregation(source, context, { mode: 'lower-bound' })

test('IG random pack contributions use independent enemy lower bounds and preserve the raw schedule', () => {
  const source = level([spawn('fixed', 6, { weight: 50 }),
    candidate('a', 5, 'one'), spawn('b', 3, { randomSpawnGroupPackKey: 'one', weight: 50 }),
    candidate('a', 2, 'two'), spawn('b', 4, { randomSpawnGroupPackKey: 'two', weight: 50 })])
  const before = structuredClone(source)
  const analysis = analyzeEnemySpawns(source, context)
  assert.deepEqual([...analysis.counts], [['fixed', 6], ['a', 2], ['b', 3]])
  assert.equal(analysis.actions[0].status, 'included')
  assert.ok(analysis.actions.slice(1).every(action => action.status === 'conditional'))
  assert.deepEqual(analysis.aggregationConditions, ['抽選候補に共通する出現数を下限集計'])
  assert.equal(aggregate(source).count, 11)
  assert.equal(aggregate(source).kind, 'lower-bound')
  assert.equal(resolveEnemySpawnAggregation(source, context).kind, 'excluded')
  assert.deepEqual(source, before)
})

test('random common civilians never inflate the known hostile contribution', () => {
  const source = level([candidate('enemy_3001_upeopl', 3, null), candidate('enemy_3001_upeopl', 5, null)])
  assert.equal(analyzeEnemySpawns(source, context).counts.get('enemy_3001_upeopl'), 3)
  assert.equal(aggregate(source).kind, 'excluded')
  source.waves[0].fragments[0].actions.push(spawn('hostile', 2, { weight: 50 }))
  source.enemyDbRefs.push({ id: 'hostile', useDb: true, level: 0 })
  const result = aggregate(source)
  assert.equal(result.count, 2)
  assert.equal(result.counts.get('enemy_3001_upeopl'), 0)
  assert.equal(result.excludedNonEnemySpawns[0].count, 3)
})

test('difficulty, unknown fields, unsupported source revisions and branch uncertainty still apply', () => {
  const hidden = level([candidate('a', 3, null), candidate('a', 5, null, { hiddenGroup: 'disabled' })])
  assert.equal(aggregate(hidden).kind, 'excluded')
  const malformed = level([candidate('a', 3, null), candidate('a', 5, null, { repeatCount: 99 })])
  assert.equal(aggregate(malformed).kind, 'excluded')
  const source = level([spawn('fixed', 2, { weight: 50 }), candidate('a', 3, null), candidate('a', 5, null)])
  assert.equal(resolveEnemySpawnAggregation(source, { ...context, sourceRevision: 'unreviewed' }, { mode: 'lower-bound' }).kind, 'excluded')
  source.branches = { runtime: { phases: [{ actions: [spawn('a', 100)] }] } }
  assert.equal(aggregate(source).count, 5)
  assert.ok(aggregate(source).reasons.includes('branch-spawn'))
})

test('the map index and histogram share the same random lower bound and conditions', () => {
  const source = level([candidate('a', 5, null), candidate('a', 3, null)])
  const levels = [{ levelId: context.levelId, data: source }]
  const stage = { stageId: 'ig', levelId: context.levelId, code: 'IG-1', name: 'test', zoneId: 'act1multi_zone1',
    difficulty: 'NORMAL', diffGroup: 'NONE', isStoryOnly: false }
  const histogram = buildEnemyHistogramCounts(levels, { spawnAggregationMode: 'lower-bound',
    sourceRevision: context.sourceRevision, stageContexts: { [context.levelId]: stage } })
  const maps = buildMapDatabase({ levels, stageTable: { stages: { ig: stage } },
    zoneTable: { zones: { act1multi_zone1: { type: 'ACTIVITY', zoneNameFirst: 'IG' } } }, handbook: { enemyData: {} }, database: {},
    sourceRevision: context.sourceRevision, spawnAggregationMode: 'lower-bound' })
  const map = maps.index.maps[0]
  assert.equal(map.spawnAggregation.count, 3)
  assert.equal(histogram.enemies.a.spawnCount, 3)
  assert.equal(histogram.summary.spawnMapCount, 1)
  assert.equal(histogram.summary.lowerBoundMapCount, 1)
  assert.deepEqual(histogram.diagnostics.aggregationConditions, [{ levelId: context.levelId, conditions: map.aggregationConditions }])
})

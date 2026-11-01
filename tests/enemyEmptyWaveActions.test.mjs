import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { analyzeEnemySpawns } from '../scripts/lib/enemySpawnConditions.mjs'
import { resolveEnemySpawnAggregation } from '../scripts/lib/enemySpawnAggregation.mjs'
import { buildEnemyHistogramCounts } from '../scripts/generateEnemyHistogramCounts.mjs'
import { buildMapDatabase, extractMapWaves } from '../scripts/generateMapDatabase.mjs'

const fixture = JSON.parse(gunzipSync(await readFile(new URL('./fixtures/enemySpawnCollections/ss-ex-5.json.gz', import.meta.url))))
const expectedCounts = { enemy_10105_mjcdol_2: 9, enemy_10107_mjcdog_2: 6, enemy_10103_mjcppp_2: 19 }

test('SS-EX-5 has 34 fixed spawns in both stage environments with one harmless empty first interval', () => {
  assert.equal(fixture.sourceRevision, '60e3aaf434919fbca931024a59d51088e810a9d3')
  assert.equal(fixture.sourcePath, 'jp/gamedata/levels/activities/act45side/level_act45side_ex05.json')
  const before = structuredClone(fixture.data)
  assert.deepEqual(fixture.data.waves[0].fragments[0], { preDelay: 0, actions: {} })
  assert.deepEqual(fixture.stages.map(stage => stage.difficulty), ['NORMAL', 'FOUR_STAR'])
  for (const stage of fixture.stages) {
    const context = { ...stage, sourceRevision: fixture.sourceRevision, levelId: fixture.levelId }
    const analysis = analyzeEnemySpawns(fixture.data, context)
    assert.deepEqual([...analysis.reasons], [])
    assert.deepEqual(Object.fromEntries(analysis.counts), expectedCounts)
    assert.equal(analysis.actions.length, 15)
    assert.ok(analysis.actions.every(action => action.status === 'included' && action.conditions.join() === '固定'))
    for (const mode of ['strict', 'lower-bound', 'expected-lower-bound']) {
      const result = resolveEnemySpawnAggregation(fixture.data, context, { mode })
      assert.equal(result.kind, 'exact')
      assert.equal(result.count, 34)
      assert.deepEqual(Object.fromEntries(result.counts), expectedCounts)
    }
    const waves = extractMapWaves(fixture.data, context, analysis)
    assert.equal(waves.length, 2)
    assert.equal(waves.flatMap(wave => wave.fragments).length, 6)
    assert.deepEqual(waves[0].fragments[0], { preDelay: 0, actions: [] })
    for (const action of analysis.actions) {
      const displayed = waves[action.waveIndex].fragments[action.fragmentIndex].actions[action.actionIndex]
      assert.equal(displayed.resolution.resolvedCount, action.resolvedCount)
      assert.equal(displayed.resolution.resolvedEnemyId, action.resolvedEnemyId)
    }
  }
  assert.deepEqual(fixture.data, before)
})

test('SS-EX-5 histogram and map detail agree without counting its normal/challenge aliases twice', () => {
  const stages = Object.fromEntries(fixture.stages.map(stage => [stage.stageId, { ...stage, levelId: fixture.levelId,
    isStoryOnly: false, code: 'SS-EX-5', name: '第五章・ふかふかの布団', zoneId: 'act45side_zone2' }]))
  const context = { ...fixture.stages[0], sourceRevision: fixture.sourceRevision, levelId: fixture.levelId }
  const levels = [{ levelId: fixture.levelId, data: fixture.data }]
  const histogram = buildEnemyHistogramCounts(levels, { sourceRevision: fixture.sourceRevision,
    spawnAggregationMode: 'expected-lower-bound', stageContexts: new Map([[fixture.levelId, context]]) })
  assert.equal(histogram.summary.spawnMapCount, 1)
  assert.equal(histogram.summary.spawnExcludedMapCount, 0)
  assert.equal(histogram.summary.lowerBoundMapCount, 0)
  const maps = buildMapDatabase({ stageTable: { stages }, zoneTable: { zones: { act45side_zone2: { type: 'ACTIVITY' } } },
    levels, handbook: {}, database: {}, sourceRevision: fixture.sourceRevision, spawnAggregationMode: 'expected-lower-bound' })
  assert.equal(maps.index.maps.length, 1)
  const map = maps.index.maps[0]
  assert.equal(map.stageId, 'act45side_ex05')
  assert.equal(map.status, 'supported')
  assert.equal(map.spawnCount, 34)
  assert.equal(map.spawnAggregation, undefined)
  const detail = maps.details[map.detailFile].maps[map.levelId]
  assert.equal(detail.waves[0].fragments[0].actions.length, 0)
  assert.equal(detail.enemies.reduce((sum, enemy) => sum + enemy.count, 0), 34)
  for (const [id, count] of Object.entries(expectedCounts)) {
    assert.equal(histogram.enemies[id].spawnCount, count)
    assert.equal(detail.enemies.find(enemy => enemy.id === id).count, count)
  }
})

test('unknown content in the same real-data interval cannot inherit SS-EX-5 acceptance', () => {
  for (const value of [null, { enemy: 'enemy_10105_mjcdol_2' }, { 0: fixture.data.waves[0].fragments[1].actions[0] }]) {
    const source = structuredClone(fixture.data)
    source.waves[0].fragments[0].actions = value
    assert.ok(analyzeEnemySpawns(source).reasons.has('invalid-actions'))
    assert.equal(resolveEnemySpawnAggregation(source, {}, { mode: 'expected-lower-bound' }).kind, 'excluded')
    assert.equal(extractMapWaves(source), null)
  }
})

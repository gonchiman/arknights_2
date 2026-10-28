import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { buildMapDatabase } from '../scripts/generateMapDatabase.mjs'
import { buildEnemyHistogramCounts } from '../scripts/generateEnemyHistogramCounts.mjs'
import { getMapDetail, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'
import { getMapCoverageStatus, summarizeMapCoverage } from '../src/lib/enemyMapCoverage.ts'

const sourceRevision = '60e3aaf434919fbca931024a59d51088e810a9d3'
const context = { difficulty: 'NORMAL', diffGroup: 'NONE' }
const dv3Id = 'activities/act19side/level_act19side_03'
const campaignId = 'obt/campaign/level_camp_r_14'
const fixture = name => JSON.parse(gunzipSync(readFileSync(new URL(`./fixtures/enemyBranchPolicy/${name}.json.gz`, import.meta.url))))
const source = new Map([[dv3Id, fixture('dv3-level')], ...fixture('power-armor-levels').levels])
const levels = [...source].map(([levelId, data]) => ({ levelId, data }))
const stageTable = { stages: Object.fromEntries(levels.map(({ levelId }) => {
  const stageId = levelId.split('/').at(-1).replace(/^level_/, '')
  return [stageId, { stageId, levelId, code: stageId, name: '機構共通判定', isStoryOnly: false,
    zoneId: levelId === campaignId ? 'campaign' : 'event', ...context }]
})) }
const zoneTable = { zones: {
  event: { type: 'ACTIVITY', zoneNameFirst: 'イベント' },
  campaign: { type: 'CAMPAIGN', zoneNameFirst: '殲滅作戦' },
} }
const expected = new Map([
  ['03', 40], ['04', 32], ['05', 30], ['06', 36], ['07', 48],
  ['ex02', 38], ['ex03', 35], ['ex05', 35], ['ex06', 35], ['ex07', 30],
  ['sub-1-1', 32], ['sub-1-2', 37],
].map(([suffix, count]) => [`activities/act19side/level_act19side_${suffix}`, count]))
const stageContexts = new Map(levels.map(({ levelId }) => [levelId, context]))
const build = (revision = sourceRevision) => buildMapDatabase({ stageTable, zoneTable,
  handbook: {}, database: {}, levels, sourceRevision: revision })

test('the shared mechanism yields matching totals and archived evidence across all twelve applicable maps', () => {
  const output = build(), parsed = parseMapIndex(output.index)
  const histogram = buildEnemyHistogramCounts(levels, { sourceRevision, stageContexts, excludedLevelIds: [campaignId] })
  const shards = new Map(Object.entries(output.details).map(([file, document]) => [file, parseMapDetailShard(document)]))
  for (const map of parsed.maps) {
    const detail = getMapDetail(shards.get(map.detailFile), map)
    if (expected.has(map.levelId)) {
      assert.equal(map.status, 'supported', map.levelId)
      assert.equal(map.spawnCount, expected.get(map.levelId), map.levelId)
      assert.equal(detail.enemies.reduce((sum, enemy) => sum + enemy.count, 0), map.spawnCount)
      assert.ok(map.omittedBranchSpawns.length > 0)
      assert.ok(map.omittedBranchSpawns.every(entry => entry.ruleId === 'inactive-power-armor-v2'))
      assert.deepEqual(map.omittedBranchSpawns, output.index.maps.find(entry => entry.levelId === map.levelId).omittedBranchSpawns)
    } else if (map.levelId !== campaignId) {
      assert.equal(map.status, 'excluded', map.levelId)
      assert.equal(map.spawnCount, null)
      assert.ok(map.reasons.includes('branch-spawn'))
      assert.ok(detail.enemies.every(enemy => enemy.count === null))
    }
  }
  assert.equal(histogram.summary.spawnMapCount, 12)
  assert.equal(histogram.summary.spawnExcludedMapCount, 4)
  assert.equal(histogram.summary.mapCount, 16)
  assert.equal(histogram.summary.excludedMapCount, 1)
  assert.equal(Object.values(histogram.enemies).reduce((sum, entry) => sum + entry.spawnCount, 0), 428)
  assert.deepEqual(summarizeMapCoverage(parsed.maps, 'SPAWNS'), { total: 17, included: 12, excluded: 5, missing: 0 })
})

test('the mechanism applies to annihilation without expanding the aggregation scope', () => {
  const maps = parseMapIndex(build().index)
  const campaign = maps.maps.find(map => map.levelId === campaignId)
  assert.equal(campaign.status, 'supported')
  assert.equal(campaign.spawnCount, 400)
  assert.equal(campaign.omittedBranchSpawns.length, 10)
  assert.equal(getMapCoverageStatus(campaign, 'SPAWNS'), 'excluded')
  assert.equal(getMapCoverageStatus(campaign, 'MAPS'), 'excluded')
  const histogram = buildEnemyHistogramCounts([{ levelId: campaignId, data: source.get(campaignId) }], {
    sourceRevision, stageContexts, excludedLevelIds: [campaignId],
  })
  assert.equal(histogram.summary.mapCount, 0)
  assert.equal(histogram.summary.spawnMapCount, 0)
  assert.deepEqual(histogram.enemies, {})
  assert.deepEqual(histogram.diagnostics.excludedLevelIds, [campaignId])
})

test('main-wave active suits remain counted when the same enemy IDs also occur in omitted branches', () => {
  const histogram = buildEnemyHistogramCounts(levels, { sourceRevision, stageContexts, excludedLevelIds: [campaignId] })
  assert.equal(histogram.enemies.enemy_1255_lybgpa_2.spawnCount, 12)
  assert.equal(histogram.enemies.enemy_1256_lyacpa_2.spawnCount, 2)
  const output = build(), map = output.index.maps.find(map => map.levelId.endsWith('level_act19side_ex05'))
  const detail = output.details[map.detailFile].maps[map.levelId]
  assert.equal(detail.enemies.find(enemy => enemy.id === 'enemy_1255_lybgpa_2').count, 1)
  assert.equal(detail.enemies.find(enemy => enemy.id === 'enemy_1256_lyacpa_2').count, 1)
  assert.equal(map.omittedBranchSpawns.filter(entry => entry.enemyId === 'enemy_1255_lybgpa_2').length, 5)
  assert.equal(map.omittedBranchSpawns.filter(entry => entry.enemyId === 'enemy_1256_lyacpa_2').length, 2)
})

test('both generators hold unverified revisions and contexts instead of treating branches as zero', () => {
  const one = [{ levelId: dv3Id, data: source.get(dv3Id) }]
  for (const revision of [undefined, 'f'.repeat(40)]) {
    const maps = buildMapDatabase({ stageTable, zoneTable, handbook: {}, database: {}, levels: one, sourceRevision: revision })
    const histogram = buildEnemyHistogramCounts(one, { sourceRevision: revision, stageContexts })
    const map = maps.index.maps.find(map => map.levelId === dv3Id)
    assert.equal(map.status, 'excluded')
    assert.equal(map.spawnCount, null)
    assert.equal(map.omittedBranchSpawns, undefined)
    assert.equal(histogram.summary.spawnMapCount, 0)
    assert.equal(histogram.summary.spawnExcludedMapCount, 1)
    assert.ok(histogram.diagnostics.excludedLevels[0].reasons.includes('branch-spawn'))
  }
  const histogram = buildEnemyHistogramCounts(one, { sourceRevision, stageContexts: new Map() })
  assert.equal(histogram.summary.spawnMapCount, 0)
  assert.ok(histogram.diagnostics.excludedLevels[0].reasons.includes('unsupported-difficulty-context'))
})

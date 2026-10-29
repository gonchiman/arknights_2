import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import {
  getMapCoverageDisplayStatus, summarizeMapCoverageDisplay, getMapCoverageDisplayCategories,
  getMapCoverageStatus, summarizeMapCoverage, getMapCoverageCategories,
  getMapCoverageStatusLabel, getMapCoverageReasons,
} from '../src/lib/enemyMapCoverage.ts'
import { parseMapIndex } from '../src/lib/mapDatabase.ts'
import { parseEnemyHistogramCounts } from '../src/lib/enemyHistogramCounts.ts'
import { parseEnemyAggregationBundle, parseEnemyAggregationIndex } from '../src/lib/enemyAggregationContract.ts'
import type { MapSummary } from '../src/types/map.ts'

const base: MapSummary = {
  levelId: 'obt/main/example', stageId: 'main_example', code: '1-1', name: 'example',
  zoneId: 'main_1', zoneName: '第一章', zoneType: 'MAINLINE',
  status: 'supported', spawnCount: 0, enemyIds: [], reasons: [], detailFile: 'details-0.json',
}
const pending: MapSummary = { ...base, levelId: 'pending', status: 'excluded', spawnCount: null, reasons: ['branch-spawn'] }
const missing: MapSummary = { ...base, levelId: 'missing', status: 'missing', spawnCount: null, detailFile: null, reasons: ['missing-level'] }
const lower: MapSummary = { ...pending, levelId: 'lower', spawnAggregation: { kind: 'lower-bound', count: 5, reasons: ['branch-spawn'] } }

test('display classification separates data readiness from statistical scope', () => {
  for (const scope of [{}, { zoneType: 'CAMPAIGN' }, { zoneType: 'FUTURE' }]) {
    const excluded = Object.keys(scope).length > 0
    for (const mode of ['SPAWNS', 'MAPS'] as const) {
      assert.equal(getMapCoverageDisplayStatus({ ...missing, ...scope }, mode), 'missing')
      assert.equal(getMapCoverageDisplayStatus({ ...base, ...scope }, mode), excluded ? 'excluded' : 'included')
      assert.equal(getMapCoverageDisplayStatus({ ...lower, ...scope }, mode), excluded ? 'excluded' : 'included')
      assert.equal(getMapCoverageDisplayStatus({ ...pending, ...scope }, mode), mode === 'SPAWNS'
        ? 'pending' : excluded ? 'excluded' : 'included')
    }
  }
  for (const count of [0, -1, 1.5, NaN, Infinity]) {
    const invalid = { ...lower, spawnAggregation: { ...lower.spawnAggregation!, count } }
    assert.equal(getMapCoverageDisplayStatus(invalid, 'SPAWNS'), 'pending')
  }
})

test('story environments have a dedicated display category before all data statuses in both modes', () => {
  for (const map of [base, pending, missing, lower]) {
    for (const zoneType of ['MAINLINE', 'CAMPAIGN']) {
      const story = { ...map, diffGroup: 'EASY', zoneType }
      for (const mode of ['SPAWNS', 'MAPS'] as const) {
        assert.equal(getMapCoverageDisplayStatus(story, mode), 'story')
        assert.equal(getMapCoverageStatusLabel(story, mode), '物語環境・対象外')
        assert.deepEqual(summarizeMapCoverageDisplay([story], mode), {
          total: 1, included: 0, excluded: 0, pending: 0, missing: 0, story: 1,
        })
        assert.equal(getMapCoverageStatus(story, mode), 'excluded')
      }
    }
  }
})

test('display labels retain lower-bound inclusion and distinguish held, excluded and missing maps', () => {
  assert.equal(getMapCoverageStatusLabel(base, 'SPAWNS'), '集計対象')
  assert.equal(getMapCoverageStatusLabel(lower, 'SPAWNS'), '下限集計')
  assert.equal(getMapCoverageStatusLabel(lower, 'MAPS'), '集計対象')
  assert.equal(getMapCoverageStatusLabel(pending, 'SPAWNS'), '解析保留')
  assert.equal(getMapCoverageStatusLabel({ ...pending, zoneType: 'CAMPAIGN' }, 'SPAWNS'), '解析保留')
  assert.equal(getMapCoverageStatusLabel({ ...base, diffGroup: 'EASY' }, 'SPAWNS'), '物語環境・対象外')
  assert.equal(getMapCoverageStatusLabel({ ...missing, diffGroup: 'EASY' }, 'SPAWNS'), '物語環境・対象外')
})

test('scope reasons cannot hide missing data or unresolved spawn conditions', () => {
  assert.deepEqual(getMapCoverageReasons({ ...missing, diffGroup: 'EASY' }, 'SPAWNS'), ['物語環境', 'マップデータ未取得'])
  assert.deepEqual(getMapCoverageReasons({ ...pending, zoneType: 'CAMPAIGN' }, 'SPAWNS'), ['その他のマップ', '分岐に応じた出現指定'])
  assert.deepEqual(getMapCoverageReasons({ ...pending, zoneType: 'CAMPAIGN' }, 'MAPS'), ['その他のマップ', 'マップデータ取得済み'])
  assert.deepEqual(getMapCoverageReasons({ ...missing, diffGroup: 'EASY', zoneType: 'CAMPAIGN' }, 'MAPS'), [
    '物語環境', 'その他のマップ', 'マップデータ未取得',
  ])
  assert.deepEqual(getMapCoverageReasons({ ...lower, diffGroup: 'EASY' }, 'SPAWNS'), [
    '物語環境', '確定出現分のみ判明', '分岐に応じた出現指定',
  ])
})

test('display summaries deduplicate levels and count lower bounds only inside included', () => {
  const maps = [base, { ...base, stageId: 'duplicate' }, pending, missing, lower,
    { ...lower, levelId: 'excluded-lower', zoneType: 'CAMPAIGN' },
    { ...missing, levelId: 'excluded-missing', zoneType: 'CAMPAIGN' },
    { ...pending, levelId: 'excluded-pending', diffGroup: 'EASY' }]
  assert.deepEqual(summarizeMapCoverageDisplay(maps, 'SPAWNS'), {
    total: 7, included: 2, excluded: 1, pending: 1, missing: 2, story: 1, lowerBound: 1,
  })
  assert.deepEqual(summarizeMapCoverageDisplay(maps, 'MAPS'), {
    total: 7, included: 3, excluded: 1, pending: 0, missing: 2, story: 1,
  })
  assert.deepEqual(summarizeMapCoverageDisplay([], 'SPAWNS'), { total: 0, included: 0, excluded: 0, pending: 0, missing: 0, story: 0 })
  const categories = getMapCoverageDisplayCategories(maps, 'SPAWNS')
  assert.deepEqual(categories.map(({ key, total, included, excluded, pending, missing, story }) => ({ key, total, included, excluded, pending, missing, story })), [
    { key: 'main', total: 5, included: 2, excluded: 0, pending: 1, missing: 1, story: 1 },
    { key: 'event', total: 0, included: 0, excluded: 0, pending: 0, missing: 0, story: 0 },
    { key: 'supply', total: 0, included: 0, excluded: 0, pending: 0, missing: 0, story: 0 },
    { key: 'other', total: 2, included: 0, excluded: 1, pending: 0, missing: 1, story: 0 },
  ])
})

test('V1–V4 archives remain readable and retain histogram counts and all included map IDs', async () => {
  const archive = new URL('../public/data/enemy-aggregation/', import.meta.url)
  const indexBytes = await readFile(new URL('index.json', archive))
  const index = parseEnemyAggregationIndex(JSON.parse(indexBytes.toString()))
  assert.deepEqual(index.versions.map(version => version.id), ['v1', 'v2', 'v3', 'v4'])
  for (const version of index.versions) {
    const bytes = await readFile(new URL(version.file, archive))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), version.sha256)
    const raw = JSON.parse(gunzipSync(bytes).toString())
    const before = JSON.stringify(raw.files['enemy-histogram-counts.json'])
    const bundle = parseEnemyAggregationBundle(raw, version.id)
    const { maps } = parseMapIndex(bundle.files['maps/index.json'])
    const histogram = parseEnemyHistogramCounts(bundle.files['enemy-histogram-counts.json'])
    for (const mode of ['SPAWNS', 'MAPS'] as const) {
      const legacy = summarizeMapCoverage(maps, mode)
      const display = summarizeMapCoverageDisplay(maps, mode)
      assert.deepEqual(maps.filter(map => getMapCoverageDisplayStatus(map, mode) === 'included').map(map => map.levelId),
        maps.filter(map => getMapCoverageStatus(map, mode) === 'included').map(map => map.levelId), `${version.id} ${mode}`)
      assert.equal(display.included, legacy.included)
      assert.equal(display.lowerBound, legacy.lowerBound)
      assert.equal(display.total, legacy.total)
      assert.equal(display.included + display.excluded + display.pending + display.missing + display.story, display.total)
      const categories = getMapCoverageDisplayCategories(maps, mode)
      assert.deepEqual(categories.map(category => category.included), getMapCoverageCategories(maps, mode).map(category => category.included))
      assert.equal(categories.reduce((sum, category) => sum + category.total, 0), display.total)
    }
    const legacy = summarizeMapCoverage(maps, 'SPAWNS')
    assert.equal(legacy.included, version.summary.includedMapCount)
    assert.equal(legacy.excluded, version.summary.excludedMapCount)
    assert.equal(legacy.missing, version.summary.missingMapCount)
    assert.equal(legacy.included, histogram.summary.spawnMapCount)
    assert.equal(legacy.excluded, histogram.summary.spawnExcludedMapCount + (histogram.summary.excludedMapCount ?? 0))
    assert.equal(legacy.missing, histogram.summary.missingMapCount)
    assert.equal(JSON.stringify(raw.files['enemy-histogram-counts.json']), before)
  }
  assert.deepEqual(await readFile(new URL('index.json', archive)), indexBytes)
})

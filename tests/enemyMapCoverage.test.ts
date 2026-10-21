import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  getMapCoverageCategories,
  getMapCoverageEnvironmentLabel,
  getMapCoverageReasons,
  getMapCoverageStatus,
  getMapCoverageZones,
  summarizeMapCoverage,
} from '../src/lib/enemyMapCoverage.ts'
import { parseMapIndex } from '../src/lib/mapDatabase.ts'
import type { MapSummary } from '../src/types/map.ts'

const source = await readFile(new URL('../public/data/maps/index.json', import.meta.url), 'utf8')
const { maps } = parseMapIndex(JSON.parse(source))
const base: MapSummary = {
  levelId: 'obt/main/level_main_01-07', stageId: 'main_01-07', code: '1-7', name: '暴君',
  zoneId: 'main_1', zoneName: '第一章 暗黒時代・下', zoneType: 'MAINLINE',
  status: 'supported', spawnCount: 0, enemyIds: [], reasons: [], detailFile: 'details-0.json',
}

test('the recorded map population matches the histogram coverage in both modes', async () => {
  const histogram = JSON.parse(await readFile(new URL('../public/data/enemy-histogram-counts.json', import.meta.url), 'utf8'))
  const spawns = summarizeMapCoverage(maps, 'SPAWNS')
  const appearances = summarizeMapCoverage(maps, 'MAPS')
  assert.deepEqual(spawns, { total: 2298, included: 1474, excluded: 524, missing: 300 })
  assert.deepEqual(appearances, { total: 2298, included: 1998, excluded: 0, missing: 300 })
  assert.equal(spawns.included, histogram.summary.spawnMapCount)
  assert.equal(spawns.excluded, histogram.summary.spawnExcludedMapCount)
  assert.equal(spawns.missing, histogram.summary.missingMapCount)
  assert.equal(appearances.included, histogram.summary.mapCount)
})

test('the four content categories preserve the complete map population', () => {
  const categories = getMapCoverageCategories(maps, 'SPAWNS')
  assert.deepEqual(categories, [
    { key: 'main', label: 'メインテーマ', total: 584, included: 375, excluded: 87, missing: 122 },
    { key: 'event', label: 'イベント', total: 1416, included: 863, excluded: 375, missing: 178 },
    { key: 'supply', label: '物資調達・SoC', total: 35, included: 35, excluded: 0, missing: 0 },
    { key: 'other', label: 'その他', total: 263, included: 201, excluded: 62, missing: 0 },
  ])
  const appearances = getMapCoverageCategories(maps, 'MAPS')
  assert.deepEqual(appearances.map(({ included }) => included), [462, 1238, 35, 263])
  for (const category of [...categories, ...appearances]) {
    assert.equal(category.included + category.excluded + category.missing, category.total)
  }
})

test('mode changes include uncertain spawns only for map appearances, never missing maps', () => {
  const uncertain: MapSummary = { ...base, levelId: 'uncertain', status: 'excluded', spawnCount: null, reasons: ['branch-spawn'] }
  const missing: MapSummary = { ...base, levelId: 'missing', status: 'missing', spawnCount: null, detailFile: null }
  assert.equal(getMapCoverageStatus(base, 'SPAWNS'), 'included')
  assert.equal(getMapCoverageStatus(base, 'MAPS'), 'included')
  assert.equal(getMapCoverageStatus(uncertain, 'SPAWNS'), 'excluded')
  assert.equal(getMapCoverageStatus(uncertain, 'MAPS'), 'included')
  assert.equal(getMapCoverageStatus(missing, 'SPAWNS'), 'missing')
  assert.equal(getMapCoverageStatus(missing, 'MAPS'), 'missing')
  assert.deepEqual(summarizeMapCoverage([], 'SPAWNS'), { total: 0, included: 0, excluded: 0, missing: 0 })
})

test('shared level data is counted once even with multiple stage records', () => {
  const duplicate = { ...base, stageId: 'main_01-07#f', difficulty: 'FOUR_STAR' }
  assert.deepEqual(summarizeMapCoverage([base, duplicate], 'SPAWNS'), { total: 1, included: 1, excluded: 0, missing: 0 })
  assert.equal(getMapCoverageCategories([base, duplicate], 'SPAWNS').reduce((total, category) => total + category.total, 0), 1)
})

test('chapter ordering is numeric and other content reuses the existing category classifier', () => {
  const examples: MapSummary[] = [
    { ...base, levelId: 'm10', zoneId: 'main_10', zoneName: '第十章' },
    { ...base, levelId: 'm2', zoneId: 'main_2', zoneName: '第二章' },
    { ...base, levelId: 'event-main', zoneId: 'act1', zoneName: '章イベント', zoneType: 'MAINLINE_ACTIVITY' },
    { ...base, levelId: 'event', zoneId: 'event2', zoneName: 'イベント', zoneType: 'ACTIVITY' },
    { ...base, levelId: 'extra', zoneId: 'main_2', zoneName: '第二章' },
    { ...base, levelId: 'unknown', zoneId: 'future', zoneName: '', zoneType: 'FUTURE_TYPE' },
  ]
  assert.deepEqual(getMapCoverageZones(examples, 'main'), [
    { id: 'main_2', name: '第二章' }, { id: 'main_10', name: '第十章' }, { id: 'act1', name: '章イベント' },
  ])
  assert.deepEqual(getMapCoverageZones(examples, 'event'), [{ id: 'event2', name: 'イベント' }])
  assert.deepEqual(getMapCoverageZones(examples, 'other'), [{ id: 'future', name: 'future' }])
  assert.equal(getMapCoverageCategories(examples, 'SPAWNS').find(({ key }) => key === 'other')?.included, 1)
})

test('environment labels distinguish challenge, difficulty groups and unspecified environments', () => {
  for (const [diffGroup, label] of [
    ['EASY', '物語'], ['NORMAL', '標準'], ['TOUGH', '厄難'], ['ALL', '共通'],
    ['NONE', '環境指定なし'], ['', '環境指定なし'], ['FUTURE', 'その他'],
  ]) assert.equal(getMapCoverageEnvironmentLabel({ ...base, diffGroup }), label)
  assert.equal(getMapCoverageEnvironmentLabel(base), '環境指定なし')
  assert.equal(getMapCoverageEnvironmentLabel({ ...base, difficulty: 'FOUR_STAR', diffGroup: 'NORMAL' }), '強襲')
})

test('coverage reasons describe the selected mode and deduplicate equivalent reasons', () => {
  const map: MapSummary = { ...base, status: 'excluded', spawnCount: null,
    reasons: ['branch-spawn', 'random-spawn-group', 'weighted-spawn', 'unsupported-wave-tag'] }
  assert.deepEqual(getMapCoverageReasons(map, 'SPAWNS'), [
    '分岐に応じた出現指定', 'ランダムな出現指定', '未対応の出現設定',
  ])
  assert.deepEqual(getMapCoverageReasons(map, 'MAPS'), ['マップデータ取得済み'])
  assert.deepEqual(getMapCoverageReasons(base, 'SPAWNS'), ['出現数確定'])
  assert.deepEqual(getMapCoverageReasons({ ...map, status: 'missing' }, 'MAPS'), ['マップデータ未取得'])
  assert.deepEqual(getMapCoverageReasons({ ...map, reasons: [] }, 'SPAWNS'), ['出現数未確定'])
  assert.deepEqual(getMapCoverageReasons({ ...map, reasons: ['future-unrecognized-setting'] }, 'SPAWNS'), ['出現数未確定'])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createEnemyMapCoverageChartSnapshot } from '../src/lib/enemyMapCoverageChartImage.ts'
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
  assert.deepEqual(spawns.totals, { total: 5, included: 2, excluded: 2, missing: 1 })
  assert.deepEqual(appearances.totals, { total: 5, included: 3, excluded: 1, missing: 1 })
  assert.deepEqual(spawns.categories[2], { key: 'supply', label: '物資調達・SoC', total: 0, included: 0, excluded: 0, missing: 0 })
  const captured = structuredClone(spawns)
  maps[2].status = 'supported'
  maps.push({ ...base, levelId: 'later' })
  appearances.categories[0].included = 999
  appearances.totals.included = 999
  assert.deepEqual(spawns, captured)
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

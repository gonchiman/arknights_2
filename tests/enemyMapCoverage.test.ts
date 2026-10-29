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
import { getMapDetail, parseMapDetailShard, parseMapIndex } from '../src/lib/mapDatabase.ts'
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
  assert.deepEqual(spawns, { total: 2298, included: 1279, excluded: 822, missing: 197 })
  assert.deepEqual(appearances, { total: 2298, included: 1735, excluded: 366, missing: 197 })
  assert.equal(spawns.included, histogram.summary.spawnMapCount)
  assert.equal(spawns.excluded, histogram.summary.spawnExcludedMapCount + histogram.summary.excludedMapCount)
  assert.equal(spawns.missing, histogram.summary.missingMapCount)
  assert.equal(appearances.included, histogram.summary.mapCount)
})

test('the four content categories preserve the complete map population', () => {
  const categories = getMapCoverageCategories(maps, 'SPAWNS')
  assert.deepEqual(categories, [
    { key: 'main', label: 'メインテーマ', total: 584, included: 379, excluded: 186, missing: 19 },
    { key: 'event', label: 'イベント', total: 1416, included: 865, excluded: 373, missing: 178 },
    { key: 'supply', label: '物資調達・SoC', total: 35, included: 35, excluded: 0, missing: 0 },
    { key: 'other', label: 'その他', total: 263, included: 0, excluded: 263, missing: 0 },
  ])
  const appearances = getMapCoverageCategories(maps, 'MAPS')
  assert.deepEqual(appearances.map(({ included }) => included), [462, 1238, 35, 0])
  for (const category of [...categories, ...appearances]) {
    assert.equal(category.included + category.excluded + category.missing, category.total)
  }
})

test('every histogram enemy total equals the resolved map details in the same aggregation scope', async () => {
  const histogram = JSON.parse(await readFile(new URL('../public/data/enemy-histogram-counts.json', import.meta.url), 'utf8'))
  const included = maps.filter((map) => getMapCoverageStatus(map, 'SPAWNS') === 'included')
  const shards = new Map(await Promise.all([...new Set(included.map((map) => map.detailFile!))].map(async (file) =>
    [file, parseMapDetailShard(JSON.parse(await readFile(new URL(`../public/data/maps/${file}`, import.meta.url), 'utf8')))] as const)))
  const totals = new Map<string, number>()
  for (const map of included) {
    const detail = getMapDetail(shards.get(map.detailFile!)!, map)
    for (const enemy of detail.enemies) {
      assert.notEqual(enemy.count, null)
      totals.set(enemy.id, (totals.get(enemy.id) ?? 0) + enemy.count!)
    }
  }
  for (const id of new Set([...totals.keys(), ...Object.keys(histogram.enemies)])) {
    assert.equal(totals.get(id) ?? 0, histogram.enemies[id]?.spawnCount ?? 0, id)
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

test('story environments stay out of both aggregations even after their data is acquired', () => {
  for (const status of ['supported', 'excluded', 'missing'] as const) {
    const story: MapSummary = { ...base, levelId: 'story', diffGroup: 'EASY', status }
    for (const mode of ['SPAWNS', 'MAPS'] as const) {
      assert.equal(getMapCoverageStatus(story, mode), 'excluded')
      const dataReason = status === 'missing' ? 'マップデータ未取得'
        : mode === 'MAPS' ? 'マップデータ取得済み' : status === 'supported' ? '出現数確定' : '出現数未確定'
      assert.deepEqual(getMapCoverageReasons(story, mode), ['物語環境', dataReason])
      assert.deepEqual(summarizeMapCoverage([base, story], mode), {
        total: 2, included: 1, excluded: 1, missing: 0,
      })
    }
  }
})

test('other map categories remain visible but never enter either aggregation', () => {
  for (const zoneType of ['CAMPAIGN', 'CLIMB_TOWER', 'GUIDE', 'FUTURE_TYPE', undefined]) {
    for (const status of ['supported', 'excluded', 'missing'] as const) {
      const other: MapSummary = { ...base, levelId: 'other', zoneType, status }
      for (const mode of ['SPAWNS', 'MAPS'] as const) {
        assert.equal(getMapCoverageStatus(other, mode), 'excluded')
        const dataReason = status === 'missing' ? 'マップデータ未取得'
          : mode === 'MAPS' ? 'マップデータ取得済み' : status === 'supported' ? '出現数確定' : '出現数未確定'
        assert.deepEqual(getMapCoverageReasons(other, mode), ['その他のマップ', dataReason])
        assert.deepEqual(summarizeMapCoverage([base, other], mode), {
          total: 2, included: 1, excluded: 1, missing: 0,
        })
      }
    }
  }
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
  assert.deepEqual(getMapCoverageCategories(examples, 'SPAWNS').find(({ key }) => key === 'other'), {
    key: 'other', label: 'その他', total: 1, included: 0, excluded: 1, missing: 0,
  })
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

test('optional branch omissions explain supported spawn totals without masking unresolved branches or scope exclusions', () => {
  const map: MapSummary = { ...base, omittedBranchSpawns: [{ branchId: 'optional', phaseIndex: 0,
    actionIndex: 0, enemyId: 'enemy_a', ruleId: 'optional-device', condition: '装置を作動させずにクリア可能',
    evidence: ['predefines.tokenInsts[0]'] }] }
  assert.equal(getMapCoverageStatus(map, 'SPAWNS'), 'included')
  assert.deepEqual(getMapCoverageReasons(map, 'SPAWNS'), ['任意の追加出現を除外'])
  assert.deepEqual(getMapCoverageReasons(map, 'MAPS'), ['マップデータ取得済み'])
  assert.deepEqual(getMapCoverageReasons({ ...map, omittedBranchSpawns: [] }, 'SPAWNS'), ['出現数確定'])
  const unresolved: MapSummary = { ...map, status: 'excluded', spawnCount: null, reasons: ['branch-spawn'] }
  assert.equal(getMapCoverageStatus(unresolved, 'SPAWNS'), 'excluded')
  assert.deepEqual(getMapCoverageReasons(unresolved, 'SPAWNS'), ['分岐に応じた出現指定'])
  assert.deepEqual(getMapCoverageReasons({ ...map, diffGroup: 'EASY' }, 'SPAWNS'), ['物語環境', '任意の追加出現を除外'])
  assert.deepEqual(getMapCoverageReasons({ ...map, zoneType: 'CAMPAIGN' }, 'SPAWNS'), ['その他のマップ', '任意の追加出現を除外'])
})

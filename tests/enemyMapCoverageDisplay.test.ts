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
const optionalBranch = {
  branchId: 'optional', phaseIndex: 0, actionIndex: 0, enemyId: 'enemy', ruleId: 'avoidable',
  condition: '追加出現を回避可能', evidence: ['verified'],
}
const optional: MapSummary = { ...base, levelId: 'optional', spawnCount: 10, omittedBranchSpawns: [optionalBranch] }

test('display classification separates data readiness from statistical scope', () => {
  for (const scope of [{}, { zoneType: 'CAMPAIGN' }, { zoneType: 'FUTURE' }]) {
    const excluded = Object.keys(scope).length > 0
    for (const mode of ['SPAWNS', 'MAPS'] as const) {
      assert.equal(getMapCoverageDisplayStatus({ ...missing, ...scope }, mode), 'missing')
      assert.equal(getMapCoverageDisplayStatus({ ...base, ...scope }, mode), excluded ? 'excluded' : 'included')
      assert.equal(getMapCoverageDisplayStatus({ ...lower, ...scope }, mode), excluded ? 'excluded' : mode === 'SPAWNS' ? 'conditional' : 'included')
      assert.equal(getMapCoverageDisplayStatus({ ...optional, ...scope }, mode), excluded ? 'excluded' : mode === 'SPAWNS' ? 'conditional' : 'included')
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
  for (const map of [base, pending, missing, lower, optional]) {
    for (const zoneType of ['MAINLINE', 'CAMPAIGN']) {
      const story = { ...map, diffGroup: 'EASY', zoneType }
      for (const mode of ['SPAWNS', 'MAPS'] as const) {
        assert.equal(getMapCoverageDisplayStatus(story, mode), 'story')
        assert.equal(getMapCoverageStatusLabel(story, mode), '物語環境・対象外')
        assert.deepEqual(summarizeMapCoverageDisplay([story], mode), {
          total: 1, included: 0, regular: 0, conditional: 0, excluded: 0, pending: 0, missing: 0, story: 1,
        })
        assert.equal(getMapCoverageStatus(story, mode), 'excluded')
      }
    }
  }
})

test('display labels group lower bounds and optional omissions as conditional inclusion', () => {
  assert.equal(getMapCoverageStatusLabel(base, 'SPAWNS'), '通常の集計対象')
  assert.equal(getMapCoverageStatusLabel(lower, 'SPAWNS'), '条件付き集計対象')
  assert.equal(getMapCoverageStatusLabel(optional, 'SPAWNS'), '条件付き集計対象')
  assert.equal(getMapCoverageStatusLabel(lower, 'MAPS'), '通常の集計対象')
  assert.equal(getMapCoverageStatusLabel(optional, 'MAPS'), '通常の集計対象')
  assert.equal(getMapCoverageStatusLabel(pending, 'SPAWNS'), '解析保留')
  assert.equal(getMapCoverageStatusLabel({ ...pending, zoneType: 'CAMPAIGN' }, 'SPAWNS'), '解析保留')
  assert.equal(getMapCoverageStatusLabel({ ...base, diffGroup: 'EASY' }, 'SPAWNS'), '物語環境・対象外')
  assert.equal(getMapCoverageStatusLabel({ ...missing, diffGroup: 'EASY' }, 'SPAWNS'), '物語環境・対象外')
})

test('only unresolved lower totals, explicit assumptions, and omitted optional enemies are conditional', () => {
  for (const kind of [undefined, 'optional'] as const) {
    const map = { ...optional, omittedBranchSpawns: [{ ...optionalBranch, kind }] }
    assert.equal(getMapCoverageDisplayStatus(map, 'SPAWNS'), 'conditional')
    assert.equal(getMapCoverageDisplayStatus(map, 'MAPS'), 'included')
    assert.equal(getMapCoverageDisplayStatus({ ...map, status: 'excluded', spawnCount: null }, 'SPAWNS'), 'pending')
    assert.equal(getMapCoverageDisplayStatus({ ...map, status: 'missing', spawnCount: null }, 'SPAWNS'), 'missing')
  }
  const nonEnemy: MapSummary = { ...base, omittedBranchSpawns: [{ ...optionalBranch, kind: 'non-enemy' }] }
  const mandatory: MapSummary = { ...base, countedBranchSpawns: [{ ...optionalBranch, count: 2 }] }
  const resolvedGroup: MapSummary = { ...base, enemyRoutes: [{ enemyId: 'enemy', routeIndex: 0, fixedWaits: [], spawnKind: 'conditional' }] }
  for (const map of [nonEnemy, mandatory, resolvedGroup]) {
    assert.equal(getMapCoverageDisplayStatus(map, 'SPAWNS'), 'included')
    assert.equal(getMapCoverageDisplayStatus(map, 'MAPS'), 'included')
  }
  const combined: MapSummary = { ...lower, omittedBranchSpawns: [optionalBranch, { ...optionalBranch, kind: 'non-enemy' }] }
  assert.deepEqual(summarizeMapCoverageDisplay([combined, { ...combined, stageId: 'duplicate' }], 'SPAWNS'), {
    total: 1, included: 1, regular: 0, conditional: 1, excluded: 0, pending: 0, missing: 0, story: 0, lowerBound: 1,
  })
  assert.deepEqual(summarizeMapCoverageDisplay([combined], 'MAPS'), {
    total: 1, included: 1, regular: 1, conditional: 0, excluded: 0, pending: 0, missing: 0, story: 0,
  })
})

test('explicit spawn assumptions are conditional only after readiness and scope checks', () => {
  const aggregationConditions = ['全WAVEクリア', '抑制ユニットによる追加出現なし']
  const assumed: MapSummary = { ...base, levelId: 'assumed', spawnCount: 30, aggregationConditions }
  assert.equal(getMapCoverageDisplayStatus(assumed, 'SPAWNS'), 'conditional')
  assert.equal(getMapCoverageStatusLabel(assumed, 'SPAWNS'), '条件付き集計対象')
  assert.equal(getMapCoverageStatus(assumed, 'SPAWNS'), 'included')
  assert.equal(getMapCoverageDisplayStatus({ ...assumed, aggregationConditions: [] }, 'SPAWNS'), 'included')
  assert.equal(getMapCoverageDisplayStatus({ ...pending, aggregationConditions }, 'SPAWNS'), 'pending')
  assert.equal(getMapCoverageDisplayStatus({ ...missing, aggregationConditions }, 'SPAWNS'), 'missing')
  assert.equal(getMapCoverageDisplayStatus({ ...assumed, zoneType: 'CAMPAIGN' }, 'SPAWNS'), 'excluded')
  assert.equal(getMapCoverageDisplayStatus({ ...assumed, diffGroup: 'EASY' }, 'SPAWNS'), 'story')
  assert.equal(getMapCoverageDisplayStatus(assumed, 'MAPS'), 'included')
  assert.deepEqual(getMapCoverageReasons(assumed, 'MAPS'), ['マップデータ取得済み'])
  assert.deepEqual(getMapCoverageReasons(assumed, 'SPAWNS'), aggregationConditions)
  assert.deepEqual(getMapCoverageReasons({ ...optional, aggregationConditions }, 'SPAWNS'), [
    ...aggregationConditions, '任意の追加出現を除外',
  ])
  assert.deepEqual(getMapCoverageReasons({ ...lower, aggregationConditions }, 'SPAWNS'), [
    '確定出現分のみ集計', ...aggregationConditions, '分岐に応じた出現指定',
  ])
  assert.deepEqual(summarizeMapCoverageDisplay([base, assumed, { ...assumed, stageId: 'duplicate' }], 'SPAWNS'), {
    total: 2, included: 2, regular: 1, conditional: 1, excluded: 0, pending: 0, missing: 0, story: 0,
  })
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
  assert.deepEqual(getMapCoverageReasons(lower, 'SPAWNS'), ['確定出現分のみ集計', '分岐に応じた出現指定'])
  assert.deepEqual(getMapCoverageReasons(optional, 'SPAWNS'), ['任意の追加出現を除外'])
})

test('display summaries deduplicate levels and count lower bounds only inside included', () => {
  const maps = [base, { ...base, stageId: 'duplicate' }, pending, missing, lower,
    { ...lower, levelId: 'excluded-lower', zoneType: 'CAMPAIGN' },
    { ...missing, levelId: 'excluded-missing', zoneType: 'CAMPAIGN' },
    { ...pending, levelId: 'excluded-pending', diffGroup: 'EASY' }]
  assert.deepEqual(summarizeMapCoverageDisplay(maps, 'SPAWNS'), {
    total: 7, included: 2, regular: 1, conditional: 1, excluded: 1, pending: 1, missing: 2, story: 1, lowerBound: 1,
  })
  assert.deepEqual(summarizeMapCoverageDisplay(maps, 'MAPS'), {
    total: 7, included: 3, regular: 3, conditional: 0, excluded: 1, pending: 0, missing: 2, story: 1,
  })
  assert.deepEqual(summarizeMapCoverageDisplay([], 'SPAWNS'), { total: 0, included: 0, regular: 0, conditional: 0, excluded: 0, pending: 0, missing: 0, story: 0 })
  const categories = getMapCoverageDisplayCategories(maps, 'SPAWNS')
  assert.deepEqual(categories.map(({ key, total, included, regular, conditional, excluded, pending, missing, story }) => ({ key, total, included, regular, conditional, excluded, pending, missing, story })), [
    { key: 'main', total: 5, included: 2, regular: 1, conditional: 1, excluded: 0, pending: 1, missing: 1, story: 1 },
    { key: 'event', total: 0, included: 0, regular: 0, conditional: 0, excluded: 0, pending: 0, missing: 0, story: 0 },
    { key: 'supply', total: 0, included: 0, regular: 0, conditional: 0, excluded: 0, pending: 0, missing: 0, story: 0 },
    { key: 'other', total: 2, included: 0, regular: 0, conditional: 0, excluded: 1, pending: 0, missing: 1, story: 0 },
  ])
})

test('V1–V5 archives remain readable and retain histogram counts and all included map IDs', async () => {
  const archive = new URL('../public/data/enemy-aggregation/', import.meta.url)
  const indexBytes = await readFile(new URL('index.json', archive))
  const index = parseEnemyAggregationIndex(JSON.parse(indexBytes.toString()))
  assert.deepEqual(index.versions.map(version => version.id), ['v1', 'v2', 'v3', 'v4', 'v5'])
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
      assert.deepEqual(maps.filter(map => ['included', 'conditional'].includes(getMapCoverageDisplayStatus(map, mode))).map(map => map.levelId),
        maps.filter(map => getMapCoverageStatus(map, mode) === 'included').map(map => map.levelId), `${version.id} ${mode}`)
      assert.equal(display.included, legacy.included)
      assert.equal(display.regular + display.conditional, display.included)
      if (mode === 'MAPS') assert.equal(display.conditional, 0)
      assert.equal(display.lowerBound, legacy.lowerBound)
      assert.equal(display.total, legacy.total)
      assert.equal(display.included + display.excluded + display.pending + display.missing + display.story, display.total)
      assert.equal(display.regular + display.conditional + display.excluded + display.pending + display.missing + display.story, display.total)
      const categories = getMapCoverageDisplayCategories(maps, mode)
      assert.deepEqual(categories.map(category => category.included), getMapCoverageCategories(maps, mode).map(category => category.included))
      assert.equal(categories.reduce((sum, category) => sum + category.total, 0), display.total)
      for (const category of categories) assert.equal(category.regular + category.conditional, category.included)
      if (version.id === 'v4' && mode === 'SPAWNS') {
        assert.deepEqual(categories.map(({ key, regular, conditional }) => ({ key, regular, conditional })), [
          { key: 'main', regular: 439, conditional: 45 },
          { key: 'event', regular: 966, conditional: 250 },
          { key: 'supply', regular: 35, conditional: 0 },
          { key: 'other', regular: 0, conditional: 0 },
        ])
      }
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

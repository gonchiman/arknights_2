import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEnemyBoxplotComparisonImageSnapshot,
  getEnemyBoxplotComparisonImageConditions,
  getEnemyBoxplotComparisonImageFilename,
  type EnemyBoxplotComparisonImageSnapshot,
} from '../src/lib/enemyBoxplotImage.ts'
import { withChartImageAspect } from '../src/lib/chartImageFilename.ts'

function fixture(): EnemyBoxplotComparisonImageSnapshot {
  return {
    data: {
      hasData: true,
      series: [{
        key: 'defense', label: '防御力', validCount: 12.5, missingCount: 1.5,
        statistics: {
          minimum: 0, firstQuartile: 85, median: 120, thirdQuartile: 220, maximum: 4000,
          lowerWhisker: 0, upperWhisker: 400, mean: 238,
          outliers: [{ value: 4000, count: 0.5 }], outlierCount: 0.5,
        },
      }, {
        key: 'magicResistance', label: '術耐性', validCount: 0, missingCount: 14, statistics: null,
      }],
    },
    scale: 'RAW', range: 'ALL', scopeLabel: 'メインストーリー · 全敵', countMode: 'SPAWNS',
    aggregationVersion: { id: 'v12', label: '集計版 v12', sourceRevision: 'source', ruleVersion: 'rules' },
    coverage: { mapCount: 268, missingMapCount: 0, spawnMapCount: 268, spawnExcludedMapCount: 0, lowerBoundMapCount: 35 },
  }
}

test('save snapshot retains statistics, fractional weights and conditions after live data changes', () => {
  const live = fixture()
  const saved = createEnemyBoxplotComparisonImageSnapshot(live)
  assert.deepEqual(saved, live)
  live.data.series[0].statistics!.outliers[0].value = 9999
  live.data.series[0].statistics!.outliers[0].count = 10
  live.data.series[0].statistics!.median = 1000
  live.data.series[0].validCount = 100
  live.data.series.push({ key: 'defense', label: 'other', validCount: 0, missingCount: 0, statistics: null })
  live.aggregationVersion!.id = 'v99'
  live.coverage!.mapCount = 1000
  live.scopeLabel = '全体'
  live.scale = 'MEDIAN'
  live.range = 'WHISKERS'

  assert.equal(saved.data.series.length, 2)
  assert.equal(saved.data.series[0].validCount, 12.5)
  assert.equal(saved.data.series[0].statistics!.median, 120)
  assert.deepEqual(saved.data.series[0].statistics!.outliers, [{ value: 4000, count: 0.5 }])
  assert.equal(saved.data.series[1].statistics, null)
  assert.equal(saved.aggregationVersion!.id, 'v12')
  assert.equal(saved.coverage!.mapCount, 268)
  assert.equal(saved.scopeLabel, 'メインストーリー · 全敵')
  assert.equal(saved.scale, 'RAW')
  assert.equal(saved.range, 'ALL')
})

test('filename identifies the box plot and every effective display setting, without computed results', () => {
  const original = fixture()
  const filename = getEnemyBoxplotComparisonImageFilename(original)
  assert.equal(filename, '敵_集計v12_防御力・術耐性の箱ひげ図_出現回数_メインストーリー·全敵_元の値_全範囲.png')
  assert.doesNotMatch(filename, /評価別分布|12\.5|4000/)
  for (const change of [
    { scale: 'MEDIAN' as const }, { range: 'WHISKERS' as const }, { countMode: 'TYPES' as const },
    { scopeLabel: '全体 · ボス' }, { aggregationVersion: { ...original.aggregationVersion!, id: 'v13' } },
  ]) {
    assert.notEqual(getEnemyBoxplotComparisonImageFilename({ ...original, ...change }), filename)
  }
  const differentResults = createEnemyBoxplotComparisonImageSnapshot(original)
  differentResults.data.series[0].statistics!.mean = 999
  differentResults.data.series[0].validCount = 99
  assert.equal(getEnemyBoxplotComparisonImageFilename(differentResults), filename)
  assert.equal(withChartImageAspect(filename, 16 / 9), filename.replace('.png', '_比率16x9.png'))
  assert.equal(withChartImageAspect(filename), filename.replace('.png', '_比率自動.png'))
})

test('conditions report the frozen aggregation and coverage without claiming unavailable series totals', () => {
  const source = fixture()
  const conditions = getEnemyBoxplotComparisonImageConditions(source)
  assert.match(conditions, /集計版 v12/)
  assert.match(conditions, /メインストーリー · 全敵/)
  assert.match(conditions, /出現回数 · 元の値 · 全範囲/)
  assert.match(conditions, /268マップ/)
  assert.match(conditions, /下限 35/)
  assert.doesNotMatch(conditions, /12\.5|14体/)
  assert.doesNotMatch(getEnemyBoxplotComparisonImageConditions({ ...source, countMode: 'TYPES' }), /マップ|下限/)
  assert.match(getEnemyBoxplotComparisonImageConditions({ ...source, countMode: 'MAPS' }), /収録 268マップ/)
  assert.equal(getEnemyBoxplotComparisonImageConditions({
    ...source, aggregationVersion: undefined, coverage: null, scale: 'MEDIAN', range: 'WHISKERS',
  }), 'メインストーリー · 全敵 · 出現回数 · 中央値＝1 · 箱とひげ')
})

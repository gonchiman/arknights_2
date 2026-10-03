import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEnemyThresholdComparison,
  createEnemyThresholdComparisonConditions,
  createEnemyThresholdBarComparisonImageFilename,
  createEnemyThresholdComparisonImageFilename,
} from '../src/lib/enemyThresholdComparison.ts'

const comparison = () => buildEnemyThresholdComparison([], createEnemyThresholdComparisonConditions(), 60, 'TYPES', null)

test('横100%棒の保存名は2配置を識別し、円グラフの保存名を維持する', () => {
  const options = { comparison: comparison(), countMode: 'TYPES' as const }
  const prefix = '敵_術耐性_100%積み上げ横棒_基準値60_種類数_条件1-通常敵_条件2-エリート敵_条件3-ボス'
  assert.equal(createEnemyThresholdBarComparisonImageFilename(options), `${prefix}_共通軸_比率自動.png`)
  assert.equal(createEnemyThresholdBarComparisonImageFilename({ ...options, labelLayout: 'AXIS' }), `${prefix}_共通軸_比率自動.png`)
  assert.equal(createEnemyThresholdBarComparisonImageFilename({ ...options, labelLayout: 'RIGHT' }), `${prefix}_数値を右側_比率自動.png`)
  assert.equal(createEnemyThresholdComparisonImageFilename(options),
    '敵_術耐性_円グラフ比較_基準値60_種類数_条件1-通常敵_条件2-エリート敵_条件3-ボス_比率自動.png')
})

test('横100%棒の保存名は基準値・集計方法・条件の順序と内容を反映する', () => {
  const options = { comparison: comparison(), countMode: 'TYPES' as const }
  const filename = createEnemyThresholdBarComparisonImageFilename(options)
  assert.match(createEnemyThresholdBarComparisonImageFilename({ ...options, comparison: { ...options.comparison, threshold: 60.5 } }), /_基準値60\.5_/)
  for (const [countMode, label] of [['MAPS', '登場マップ数'], ['SPAWNS', '出現回数']] as const) {
    const updated = createEnemyThresholdBarComparisonImageFilename({ ...options, countMode })
    assert.ok(updated.includes(`_${label}_`))
    assert.notEqual(updated, filename)
  }
  const reversed = { ...options.comparison, series: [...options.comparison.series].reverse() }
  assert.match(createEnemyThresholdBarComparisonImageFilename({ ...options, comparison: reversed }), /_条件1-ボス_条件2-エリート敵_条件3-通常敵_/)
  const conditions = createEnemyThresholdComparisonConditions()
  conditions[0].numericConditions = [{ id: 8, field: 'maxHp', operator: 'gte', value: '1000' }]
  const filtered = buildEnemyThresholdComparison([], conditions, 60, 'TYPES', null)
  assert.match(createEnemyThresholdBarComparisonImageFilename({ ...options, comparison: filtered }), /_条件1-通常敵-HP≥1000_/)
})

test('非表示条件と結果・内部IDの変更は保存名に含めない', () => {
  const result = comparison()
  result.series[0].condition.visible = false
  const options = { comparison: result, countMode: 'SPAWNS' as const, labelLayout: 'RIGHT' as const }
  const filename = createEnemyThresholdBarComparisonImageFilename(options)
  assert.match(filename, /_条件1-エリート敵_条件2-ボス_/)
  assert.doesNotMatch(filename, /通常敵/)
  result.series[0].label = '保存対象外'
  for (const series of result.series) {
    series.condition.id += 100
    series.condition.colorIndex += 100
    series.count = 999
    series.missingCount = 88
    series.matchedCount = 22
    series.distribution.buckets[0].count = 999
    series.distribution.buckets[0].proportion = 0.5
  }
  assert.equal(createEnemyThresholdBarComparisonImageFilename(options), filename)
})

test('画像全体の比率を保存名へ付与し、等価な比率を同名にする', () => {
  const options = { comparison: comparison(), countMode: 'MAPS' as const, labelLayout: 'RIGHT' as const }
  const automatic = createEnemyThresholdBarComparisonImageFilename(options)
  const wide = createEnemyThresholdBarComparisonImageFilename({ ...options, aspectRatio: 16 / 9 })
  assert.match(wide, /_数値を右側_比率16x9\.png$/)
  assert.notEqual(automatic, wide)
  assert.equal(wide, createEnemyThresholdBarComparisonImageFilename({ ...options, aspectRatio: 32 / 18 }))
  assert.notEqual(wide, createEnemyThresholdBarComparisonImageFilename({ ...options, aspectRatio: 1 }))
})

test('長い条件の省略と禁止文字は共通の保存名規約に従う', () => {
  const result = comparison()
  result.series = result.series.slice(0, 1)
  const options = { comparison: result, countMode: 'TYPES' as const, aspectRatio: 16 / 9 }
  result.series[0].label = '全敵 · A/B:C?D'
  assert.match(createEnemyThresholdBarComparisonImageFilename(options), /_条件1-全敵-A-B-C-D_共通軸_比率16x9\.png$/)
  result.series[0].label = `全敵 · ${'HP≥1000-'.repeat(100)}`
  const long = createEnemyThresholdBarComparisonImageFilename(options)
  assert.ok(new TextEncoder().encode(long).length <= 240)
  assert.match(long, /^敵_術耐性_100%積み上げ横棒_基準値60_種類数_/)
  assert.match(long, /_ほか2項目_比率16x9\.png$/)
})

test('不正な基準値と縦横比で保存名を作らない', () => {
  const result = comparison()
  for (const threshold of [-1, 101, NaN, Infinity]) {
    assert.throws(() => createEnemyThresholdBarComparisonImageFilename({ comparison: { ...result, threshold }, countMode: 'TYPES' }), RangeError)
  }
  for (const aspectRatio of [0, -1, NaN, Infinity]) {
    assert.throws(() => createEnemyThresholdBarComparisonImageFilename({ comparison: result, countMode: 'TYPES', aspectRatio }), TypeError)
  }
})

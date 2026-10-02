import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEnemyThresholdDistribution, createEnemyThresholdImageFilename } from '../src/lib/enemyThresholdDistribution.ts'
import { calculateWeightedHistogram, type WeightedHistogramObservation } from '../src/lib/enemyWeightedHistogram.ts'

test('60を境界に元の値を未満・同じ・超へ厳密に分ける', () => {
  const result = buildEnemyThresholdDistribution([
    { value: 0, weight: 2 },
    { value: 59.99999999999999, weight: 3 },
    { value: 60, weight: 5 },
    { value: 60.00000000000001, weight: 7 },
    { value: 60.5, weight: 11 },
    { value: 100, weight: 13 },
  ], 60)
  assert.equal(result.threshold, 60)
  assert.equal(result.count, 41)
  assert.equal(result.missingCount, 0)
  assert.deepEqual(result.buckets, [
    { key: 'BELOW', label: '60未満', count: 5, proportion: 5 / 41 },
    { key: 'EQUAL', label: '60と同じ', count: 5, proportion: 5 / 41 },
    { key: 'ABOVE', label: '60超', count: 31, proportion: 31 / 41 },
  ])
})

test('小数の基準値も丸めず比較する', () => {
  const result = buildEnemyThresholdDistribution([
    { value: 60, weight: 2 },
    { value: 60.5, weight: 3 },
    { value: 60.50000000000001, weight: 5 },
  ], 60.5)
  assert.deepEqual(result.buckets.map(({ count }) => count), [2, 3, 5])
  assert.deepEqual(result.buckets.map(({ label }) => label), ['60.5未満', '60.5と同じ', '60.5超'])
})

test('基準値0と100でも全区分を保持し、元の有限値を切り捨てない', () => {
  const observations = [-1, 0, 50, 100, 101].map((value) => ({ value, weight: 1 }))
  assert.deepEqual(buildEnemyThresholdDistribution(observations, 0).buckets.map(({ count }) => count), [1, 1, 3])
  assert.deepEqual(buildEnemyThresholdDistribution(observations, 100).buckets.map(({ count }) => count), [3, 1, 1])
  assert.deepEqual(buildEnemyThresholdDistribution([{ value: 0, weight: 2 }], 0).buckets.map(({ count }) => count), [0, 2, 0])
  assert.deepEqual(buildEnemyThresholdDistribution([{ value: 100, weight: 2 }], 100).buckets.map(({ count }) => count), [0, 2, 0])
})

test('欠損値は重み付きの欠損数へ加え、非正・非有限の重みは既存集計と同じく除外する', () => {
  const observations = [
    { value: 50, weight: 2 },
    { value: 60, weight: 0.5 },
    { value: 80, weight: 1.5 },
    { value: 20, weight: 0 },
    { value: 30, weight: -1 },
    { value: 40, weight: Number.NaN },
    { value: 50, weight: Number.POSITIVE_INFINITY },
    { value: 60, weight: Number.NEGATIVE_INFINITY },
    { value: null, weight: 3 },
    { value: undefined, weight: 4 },
    { value: Number.NaN, weight: 5 },
    { value: Number.NEGATIVE_INFINITY, weight: 0.5 },
    { value: Number.POSITIVE_INFINITY, weight: 1.5 },
    { value: null, weight: -1 },
    { value: null, weight: Number.NaN },
  ]
  const result = buildEnemyThresholdDistribution(observations, 60)
  const histogram = calculateWeightedHistogram(observations)
  assert.equal(result.count, 4)
  assert.equal(result.missingCount, 14)
  assert.equal(result.count, histogram.count)
  assert.equal(result.missingCount, histogram.missingCount)
  assert.deepEqual(result.buckets.map(({ proportion }) => proportion), [0.5, 0.125, 0.375])
})

test('空・欠損のみ・重み0のみでは全3区分の割合が0になる', () => {
  for (const [observations, missingCount] of [
    [[], 0],
    [[{ value: null, weight: 4 }], 4],
    [[{ value: 60, weight: 0 }], 0],
  ] as const) {
    const result = buildEnemyThresholdDistribution(observations, 60)
    assert.equal(result.count, 0)
    assert.equal(result.missingCount, missingCount)
    assert.deepEqual(result.buckets.map(({ key, count, proportion }) => ({ key, count, proportion })), [
      { key: 'BELOW', count: 0, proportion: 0 },
      { key: 'EQUAL', count: 0, proportion: 0 },
      { key: 'ABOVE', count: 0, proportion: 0 },
    ])
  }
})

test('小数と大きな重みを展開せず集計し、入力を変更しない', () => {
  const observations: readonly WeightedHistogramObservation[] = Object.freeze([
    Object.freeze({ value: 20, weight: 0.25 }),
    Object.freeze({ value: 60, weight: 0.5 }),
    Object.freeze({ value: 80, weight: 0.25 }),
  ])
  assert.deepEqual(buildEnemyThresholdDistribution(observations, 60).buckets.map(({ count }) => count), [0.25, 0.5, 0.25])
  const large = buildEnemyThresholdDistribution([{ value: 60, weight: 1_000_000_000_000 }], 60)
  assert.equal(large.count, 1_000_000_000_000)
  assert.equal(large.buckets[1].proportion, 1)
  assert.deepEqual(observations, [{ value: 20, weight: 0.25 }, { value: 60, weight: 0.5 }, { value: 80, weight: 0.25 }])
})

test('範囲外・非有限の基準値は集計と保存名の両方で拒否する', () => {
  for (const threshold of [-1, 100.00000000000001, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
    assert.throws(() => buildEnemyThresholdDistribution([], threshold), RangeError)
    assert.throws(() => createEnemyThresholdImageFilename({ threshold, countMode: 'TYPES', scopeLabel: '全敵' }), RangeError)
  }
})

test('保存名は基準値・集計方法・対象条件・縦横比を読める名前で識別する', () => {
  const options = { threshold: 60, countMode: 'TYPES' as const, scopeLabel: '全敵' }
  const filename = createEnemyThresholdImageFilename(options)
  assert.equal(filename, '敵_術耐性_円グラフ_基準値60_種類数_全敵_比率自動.png')
  assert.equal(createEnemyThresholdImageFilename(options), filename)
  assert.equal(createEnemyThresholdImageFilename({ ...options, threshold: 60.5 }),
    '敵_術耐性_円グラフ_基準値60.5_種類数_全敵_比率自動.png')
  for (const [countMode, label] of [['TYPES', '種類数'], ['MAPS', '登場マップ数'], ['SPAWNS', '出現回数']] as const) {
    assert.equal(createEnemyThresholdImageFilename({ ...options, countMode, scopeLabel: '全敵 · 通常敵', aspectRatio: 16 / 9 }),
      `敵_術耐性_円グラフ_基準値60_${label}_全敵_通常敵_比率16x9.png`)
  }
  assert.equal(createEnemyThresholdImageFilename({ ...options, aspectRatio: 16 / 9 }),
    createEnemyThresholdImageFilename({ ...options, aspectRatio: 32 / 18 }))
  assert.notEqual(createEnemyThresholdImageFilename({ ...options, aspectRatio: 1 }), filename)
})

test('保存名の禁止文字と長さは共通規約に従う', () => {
  const filename = createEnemyThresholdImageFilename({ threshold: 60, countMode: 'TYPES', scopeLabel: '全敵 · A/B:C?D' })
  assert.equal(filename, '敵_術耐性_円グラフ_基準値60_種類数_全敵_A-B-C-D_比率自動.png')
  const long = createEnemyThresholdImageFilename({ threshold: 60, countMode: 'MAPS', scopeLabel: `全敵 · ${'条件'.repeat(100)}`, aspectRatio: 16 / 9 })
  assert.ok(new TextEncoder().encode(long).length <= 240)
  assert.match(long, /^敵_術耐性_円グラフ_基準値60_登場マップ数_全敵_/)
  assert.match(long, /_ほか1項目_比率16x9\.png$/)
})


test('数値の配置を保存名で識別し、既定の配置では既存名を保つ', () => {
  const options = { threshold: 60, countMode: 'SPAWNS' as const, scopeLabel: '全敵' }
  assert.equal(createEnemyThresholdImageFilename(options), createEnemyThresholdImageFilename({ ...options, labelLayout: 'BELOW' }))
  const filenames = ['HYBRID', 'OUTSIDE', 'RIGHT'].map((labelLayout) =>
    createEnemyThresholdImageFilename({ ...options, labelLayout: labelLayout as 'HYBRID' | 'OUTSIDE' | 'RIGHT' }))
  assert.equal(new Set(filenames).size, 3)
  for (const [index, label] of ['内側＋引出線', 'すべて外側', '右側に整列'].entries()) {
    assert.equal(filenames[index], `敵_術耐性_円グラフ_基準値60_出現回数_全敵_${label}_比率自動.png`)
  }
  assert.equal(createEnemyThresholdImageFilename({ ...options, labelLayout: 'RIGHT', aspectRatio: 16 / 9 }),
    '敵_術耐性_円グラフ_基準値60_出現回数_全敵_右側に整列_比率16x9.png')
})

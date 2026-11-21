import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEnemyRankBandImageVariants, createEnemyRankBandStatisticsChartSnapshot,
  ENEMY_RANK_BAND_IMAGE_METRIC_OPTIONS, ENEMY_RANK_BAND_IMAGE_STEP_OPTIONS,
  getEnemyRankBandArchiveFilename, getEnemyRankBandVariantFilename,
  type EnemyRankBandStatisticsChartSnapshot,
} from '../src/lib/enemyRankBandStatisticsImage.ts'
import type { EnemyStandardizedRankBandStatistics } from '../src/lib/enemyRankBandStatistics.ts'
import { CHART_IMAGE_FILENAME_BYTE_LIMIT } from '../src/lib/chartImageFilename.ts'

function bands(step: number): EnemyStandardizedRankBandStatistics[] {
  return Array.from({ length: 100 / step }, (_, index) => ({
    from: index * step, to: (index + 1) * step, weight: 0.5 * step,
    defense: { min: -1, max: 2, width: 3, mean: -0.25, variance: 0.5, standardDeviation: Math.sqrt(0.5) },
    resistance: index === 0 ? null : { min: 0, max: 1, width: 1, mean: 0.5, variance: 0.25, standardDeviation: 0.5 },
  }))
}

function fixture(): EnemyRankBandStatisticsChartSnapshot {
  return {
    bands: bands(10), metric: 'standardDeviation', step: 10,
    conditions: ['集計版 v12', '全体', '標準化（全体基準）', '出現回数 50', '母分散'],
    filenameConditions: ['集計版v12', '全体', '標準化', '出現回数', '母分散'],
    stepBands: ([5, 10, 20] as const).map(step => ({ step, bands: bands(step) })),
  }
}

const all = {
  metrics: ENEMY_RANK_BAND_IMAGE_METRIC_OPTIONS.map(({ key }) => key),
  steps: ENEMY_RANK_BAND_IMAGE_STEP_OPTIONS.map(({ key }) => key),
}

test('統計量4種類と順位帯3種類の直積を正順・重複なしの12通りにする', () => {
  const source = fixture()
  const variants = buildEnemyRankBandImageVariants(source, {
    metrics: ['variance', 'mean', 'width', 'standardDeviation', 'width'], steps: [20, 10, 5, 10],
  })
  assert.equal(variants.length, 12)
  assert.deepEqual(variants.map(({ key }) => key), [
    'standardDeviation-5', 'standardDeviation-10', 'standardDeviation-20',
    'width-5', 'width-10', 'width-20', 'mean-5', 'mean-10', 'mean-20', 'variance-5', 'variance-10', 'variance-20',
  ])
  assert.equal(variants[0].label, '標準偏差 ／ 5ポイント')
  assert.equal(variants[3].label, '幅（最大−最小） ／ 5ポイント')
  assert.ok(variants.every(({ snapshot }) => snapshot.bands.length === 100 / snapshot.step))
  assert.deepEqual(buildEnemyRankBandImageVariants(source, { ...all, metrics: [] }), [])
  assert.deepEqual(buildEnemyRankBandImageVariants(source, { ...all, steps: [] }), [])
  assert.equal(buildEnemyRankBandImageVariants(source, { metrics: ['mean'], steps: [20] }).length, 1)
})

test('現在の集計だけ渡された場合は別の順位帯幅を捏造せず、空の集計も出力に含めない', () => {
  const source = fixture()
  delete source.stepBands
  const variants = buildEnemyRankBandImageVariants(source, all)
  assert.equal(variants.length, 4)
  assert.ok(variants.every(({ snapshot }) => snapshot.step === 10 && snapshot.bands.length === 10))
  assert.deepEqual(buildEnemyRankBandImageVariants(source, { metrics: ['mean'], steps: [5, 20] }), [])
  assert.deepEqual(buildEnemyRankBandImageVariants({ ...source, bands: [] }, all), [])
  source.stepBands = [{ step: 5, bands: [] }, { step: 20, bands: bands(20) }]
  assert.deepEqual(buildEnemyRankBandImageVariants(source, { metrics: ['mean'], steps: [5, 10, 20] }).map(({ key }) => key),
    ['mean-10', 'mean-20'])
})

test('スナップショットは現在の帯・全ての別幅・条件を独立にコピーして凍結する', () => {
  const source = fixture()
  const before = structuredClone(source)
  const snapshot = createEnemyRankBandStatisticsChartSnapshot(source)
  const variants = buildEnemyRankBandImageVariants(source, all)
  assert.deepEqual(source, before)
  assert.equal(Object.isFrozen(source), false)
  assert.equal(Object.isFrozen(source.bands[0].defense), false)
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.bands[0].defense), true)
  assert.equal(Object.isFrozen(snapshot.stepBands), true)
  assert.equal(Object.isFrozen(snapshot.stepBands![0].bands[0].defense), true)
  assert.notEqual(variants[0].snapshot.bands, variants[1].snapshot.bands)
  assert.notEqual(variants[0].snapshot.stepBands![0].bands, variants[1].snapshot.stepBands![0].bands)
  source.bands[0].defense!.mean = 99
  source.stepBands![0].bands[0].defense!.variance = 99
  source.conditions = ['変更']
  source.filenameConditions = ['変更']
  assert.equal(snapshot.bands[0].defense!.mean, -0.25)
  assert.equal(variants[0].snapshot.bands[0].defense!.variance, 0.5)
  assert.equal(variants[0].snapshot.bands[0].resistance, null)
  assert.equal(variants[0].snapshot.bands[0].weight, 2.5)
  assert.equal(variants[0].snapshot.conditions[0], '集計版 v12')
  assert.equal(variants[0].snapshot.filenameConditions[0], '集計版v12')
  assert.throws(() => { variants[0].snapshot.bands[0].defense!.mean = 77 }, TypeError)
})

test('現在の幅の計算結果を別幅カタログより優先し、帯ごとの数値は変換し直さない', () => {
  const source = fixture()
  source.bands[0].defense!.standardDeviation = 123
  const output = buildEnemyRankBandImageVariants(source, { metrics: ['standardDeviation'], steps: [5, 10, 20] })
  assert.equal(output[0].snapshot.bands[0].defense!.standardDeviation, Math.sqrt(0.5))
  assert.equal(output[1].snapshot.bands[0].defense!.standardDeviation, 123)
  assert.equal(output[2].snapshot.bands[0].defense!.standardDeviation, Math.sqrt(0.5))
})

test('標準偏差と分散だけに母分散条件を付け、集計版・母集団・標準化基準を保つ', () => {
  for (const initial of ['standardDeviation', 'width', 'mean', 'variance'] as const) {
    const source = fixture()
    source.metric = initial
    if (initial === 'width' || initial === 'mean') {
      source.conditions = source.conditions.filter(value => value !== '母分散')
      source.filenameConditions = source.filenameConditions.filter(value => value !== '母分散')
    }
    for (const { snapshot } of buildEnemyRankBandImageVariants(source, all)) {
      const expected = snapshot.metric === 'standardDeviation' || snapshot.metric === 'variance'
      assert.equal(snapshot.conditions.includes('母分散'), expected)
      assert.equal(snapshot.filenameConditions.includes('母分散'), expected)
      assert.deepEqual(snapshot.conditions.filter(value => value !== '母分散'),
        ['集計版 v12', '全体', '標準化（全体基準）', '出現回数 50'])
    }
  }
})

test('12枚のPNG名が統計量・順位帯・比率を識別でき、同じ比率は同じ名前になる', () => {
  const source = fixture()
  const variants = buildEnemyRankBandImageVariants(source, all)
  const names = variants.map(({ snapshot }) => getEnemyRankBandVariantFilename(snapshot, 16 / 9))
  assert.equal(new Set(names).size, 12)
  assert.equal(names[0], '防御力・術耐性の順位帯別標準偏差_集計版v12_全体_標準化_出現回数_母分散_順位帯5ポイント_比率16x9.png')
  for (const [index, name] of names.entries()) {
    const { snapshot } = variants[index]
    assert.match(name, new RegExp(`順位帯${snapshot.step}ポイント_比率16x9\\.png$`))
    assert.equal(name.includes('母分散'), snapshot.metric === 'standardDeviation' || snapshot.metric === 'variance')
    assert.equal(getEnemyRankBandVariantFilename(snapshot, 32 / 18), name)
  }
  assert.match(getEnemyRankBandVariantFilename(source), /_比率自動\.png$/)
})

test('長い日本語や絵文字の条件でも全PNG名は一意で240バイト以内に収まる', () => {
  const source = fixture()
  source.filenameConditions = ['長い条件🐻‍❄️<>:"/\\|?*'.repeat(100), '集計版v12', '標準化']
  const variants = buildEnemyRankBandImageVariants(source, all)
  const names = variants.map(({ snapshot }) => getEnemyRankBandVariantFilename(snapshot, 16 / 7))
  assert.equal(new Set(names).size, 12)
  for (const [index, name] of names.entries()) {
    assert.ok(new TextEncoder().encode(name).length <= CHART_IMAGE_FILENAME_BYTE_LIMIT)
    assert.doesNotMatch(name, /\uFFFD|[<>:"/\\|?*]/u)
    assert.match(name, /ほか\d+項目_比率16x7\.png$/)
    assert.ok(name.includes(`順位帯${variants[index].snapshot.step}ポイント`))
  }
})

test('ZIP名に枚数と選択条件を入れ、単一条件・異なる比率・長い条件を区別する', () => {
  const source = fixture()
  const variants = buildEnemyRankBandImageVariants(source, all)
  const archive = getEnemyRankBandArchiveFilename(source, variants, 16 / 9)
  assert.match(archive, /^防御力・術耐性の順位帯統計_12枚_/)
  assert.match(archive, /標準偏差・幅（最大−最小）・平均・分散/)
  assert.match(archive, /順位帯5・10・20ポイント/)
  assert.match(archive, /_比率16x9\.zip$/)
  assert.notEqual(getEnemyRankBandArchiveFilename(source, variants.slice(0, 1), 16 / 9), archive)
  assert.notEqual(getEnemyRankBandArchiveFilename(source, variants, 16 / 7), archive)
  assert.match(getEnemyRankBandArchiveFilename(source, []), /_0枚_/)
  const meanOnly = variants.filter(({ snapshot }) => snapshot.metric === 'mean')
  assert.doesNotMatch(getEnemyRankBandArchiveFilename(source, meanOnly), /母分散/)
  source.filenameConditions = ['長い条件🐻‍❄️'.repeat(100)]
  const long = getEnemyRankBandArchiveFilename(source, variants, 16 / 9)
  assert.ok(new TextEncoder().encode(long).length <= CHART_IMAGE_FILENAME_BYTE_LIMIT)
  assert.match(long, /12枚_標準偏差・幅（最大−最小）・平均・分散_順位帯5・10・20ポイント/)
})

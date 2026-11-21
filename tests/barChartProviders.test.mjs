import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createBarChartDocument, getBarChartFilename } from '../src/lib/barChartDocument.ts'
import { BAR_CHART_PROVIDERS, createBarChartFromProvider } from '../src/lib/barChartProviders.ts'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import { buildEnemyHistogramObservations } from '../src/lib/enemyHistogramCounts.ts'
import { calculateWeightedHistogram } from '../src/lib/enemyWeightedHistogram.ts'
import { buildEnemyDefenseResistanceBands } from '../src/lib/enemyDefenseResistance.ts'
import { buildHistogramCumulativeRows } from '../src/lib/histogramCumulative.ts'
import { ENEMY_STAT_METRICS } from '../src/lib/enemyStatMetrics.ts'
import { getHistogramStatRankBands } from '../src/lib/histogramStatRankBands.ts'
import { buildEnemyRatingHistogramBins } from '../src/lib/enemyRatingHistogram.ts'
import { getEnemyRatingNumericRanges } from '../src/lib/enemyStatRatings.ts'
import { formatHistogramRatingRangeLines } from '../src/lib/histogramRatingRangeStrip.ts'

const version = { id: 'v12', label: '集計版 v12', sourceRevision: 'a'.repeat(40), ruleVersion: 'fixture' }
const enemy = (id, defense, magicResistance) => ({ id, stats: { defense, magicResistance } })
const rows = [enemy('a', 0, 0), enemy('b', 300, 20), enemy('c', 600, 50),
  enemy('missing-defense', null, 10), enemy('missing-resistance', 900, null)]
const counts = {
  schemaVersion: 1, generatedAt: 'fixture', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries(rows.map(({ id }, i) => [id, { mapCount: 1, spawnCount: [1.75, 2.25, 3.5, 2.5, 4][i] }])),
}
const context = { data: { rows, counts, maps: { maps: [] } }, version, scope: 'all' }
const histogram = () => createBarChartFromProvider('enemy-stat-histogram', context)
const correspondence = () => createBarChartFromProvider('enemy-defense-resistance', context)
const inputOf = document => Object.fromEntries(['xKind', 'bins', 'filenameParts', 'fractionDigits', 'capabilities', 'semantics', 'source']
  .map(key => [key, document[key]]))
const settings = { values: true, axisBand: true, percent: true, cumulative: true }
const ratingOrder = ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS']

test('提供元は既存の度数と階級の意味を保持し、同じ入力から同じタイトルとデータを返す', () => {
  const original = structuredClone(context)
  const document = histogram()
  assert.deepEqual(BAR_CHART_PROVIDERS.map(provider => provider.id), [
    'enemy-stat-histogram', 'enemy-defense-resistance', 'enemy-stat-rating-comparison',
  ])
  assert.deepEqual(histogram(), document)
  assert.equal(document.title, '術耐性のヒストグラム')
  assert.equal(document.xAxisTitle, '術耐性（階級）')
  assert.equal(document.yAxisTitle, '出現回数（体）')
  assert.equal(document.source.population.valid, 10)
  assert.equal(document.source.population.missing, 4)
  assert.equal(document.source.population.basis, 'single-stat')
  const expected = calculateWeightedHistogram(buildEnemyHistogramObservations(rows, row => row.stats.magicResistance, 'SPAWNS', counts), {
    scale: 'LINEAR', minimumLinearBinWidth: 1, customLinearBinWidth: 10, minimumLinearUpperBound: 100,
  })
  assert.deepEqual(document.bins.map(bin => bin.value), expected.bins.map(bin => bin.count))
  assert.deepEqual(document.bins.map(bin => bin.interval), expected.bins.map(bin => ({
    start: bin.start, end: bin.isOverflow ? null : bin.end,
    includesMinimum: !bin.isOverflow, includesMaximum: !bin.isOverflow && bin.includesMaximum, isOverflow: !!bin.isOverflow,
  })))
  assert.deepEqual(context, original)
})

test('割合は欠損を除いた小数度数から求め、累積は階級全体までの割合を使う', () => {
  const document = histogram()
  const cumulative = buildHistogramCumulativeRows(document.bins.map(bin => ({ count: bin.value })), 10)
  assert.deepEqual(document.bins.map(bin => bin.share), cumulative.map(row => row.proportion))
  assert.deepEqual(document.bins.map(bin => bin.cumulativeShare), cumulative.map(row => row.cumulativeProportion))
  assert.equal(document.bins[0].value, 1.75)
  assert.equal(document.bins[0].share, .175)
  assert.equal(document.bins.at(-1).cumulativeShare, 1)
  assert.ok(document.bins.some(bin => bin.value === 0 && bin.share === 0))
  assert.equal(document.capabilities.percentages, true)
  assert.equal(document.capabilities.cumulative, true)
  assert.equal(document.capabilities.rankBands, true)
})

test('7ステータスで0・欠損・小数度数を保持し、単位とステータスごとのスナップショットを分ける', () => {
  const selectedRows = [
    { id: 'zero', stats: Object.fromEntries(ENEMY_STAT_METRICS.map(metric => [metric.key, 0])) },
    { id: 'positive', stats: { maxHp: 10000, attack: 200, defense: 400, magicResistance: 20, moveSpeed: .2, baseAttackTime: .25, massLevel: 1 } },
    { id: 'missing', stats: Object.fromEntries(ENEMY_STAT_METRICS.map(metric => [metric.key, null])) },
  ]
  const selectedCounts = { ...counts, enemies: {
    zero: { mapCount: 1, spawnCount: 1.75 }, positive: { mapCount: 1, spawnCount: 2.25 }, missing: { mapCount: 1, spawnCount: 3.5 },
  } }
  const selectedContext = { ...context, data: { ...context.data, rows: selectedRows, counts: selectedCounts } }
  const ids = new Set(), filenames = new Set()
  for (const metric of ENEMY_STAT_METRICS) {
    const input = { ...selectedContext, statKey: metric.key }
    const document = createBarChartFromProvider('enemy-stat-histogram', input)
    assert.equal(document.title, `${metric.label}のヒストグラム`)
    assert.equal(document.xAxisTitle, `${metric.label}（階級${metric.key === 'baseAttackTime' ? '・秒' : ''}）`)
    assert.equal(document.source.population.total, 7.5)
    assert.equal(document.source.population.valid, 4)
    assert.equal(document.source.population.missing, 3.5)
    assert.equal(document.bins[0].value, 1.75, '0を欠損や除外とせず第1階級で数える')
    assert.equal(document.bins.reduce((sum, bin) => sum + bin.value, 0), 4)
    assert.ok(document.bins.some(bin => bin.value === 2.25), '期待度数を丸めない')
    assert.equal(document.bins.at(-1).cumulativeShare, 1)
    assert.ok(document.fractionDigits >= 2)
    const captured = JSON.stringify(document)
    input.statKey = metric.key === 'maxHp' ? 'attack' : 'maxHp'
    const changed = createBarChartFromProvider('enemy-stat-histogram', input)
    assert.notEqual(changed.id, document.id)
    assert.equal(JSON.stringify(document), captured)
    assert.equal(document.semantics.xUnit, metric.key === 'baseAttackTime' ? '秒' : undefined)
    ids.add(document.id)
    const filename = getBarChartFilename(document, settings, 16 / 9)
    assert.ok(filename.includes(`${metric.label}のヒストグラム`))
    filenames.add(filename)
  }
  assert.equal(ids.size, 7)
  assert.equal(filenames.size, 7)
  assert.throws(() => createBarChartFromProvider('enemy-stat-histogram', { ...selectedContext, statKey: 'stageAppearanceCount' }), /ステータス/)
  assert.throws(() => createBarChartFromProvider('enemy-stat-histogram', { ...selectedContext, statKey: 'unknown' }), /ステータス/)
})

test('対応する防御力は既存の術耐性下限別の値で、度数と累積へ変換しない', () => {
  const document = correspondence()
  const expected = buildEnemyDefenseResistanceBands(rows, counts)
  assert.equal(document.xKind, 'point')
  assert.equal(document.source.countMode, 'SPAWNS')
  assert.equal(document.source.population.basis, 'paired-stats')
  assert.equal(document.source.population.valid, expected.total)
  assert.deepEqual(document.bins.map(bin => [bin.point, bin.value, bin.rankPercentage, bin.rankCutoff]),
    expected.resistanceThresholds.map(row => [row.resistance, row.defense, row.percentage, row.rankCutoff]))
  assert.equal(document.bins[0].value, 0)
  assert.equal(document.bins.at(-1).value, null)
  assert.ok(document.bins.every(bin => !('share' in bin) && !('cumulativeShare' in bin)))
  assert.equal(document.capabilities.percentages, false)
  assert.equal(document.capabilities.cumulative, false)
  assert.equal(Boolean(document.capabilities.rankBands), false)
  assert.throws(() => createBarChartFromProvider('enemy-defense-resistance', { ...context, countMode: 'TYPES' }), /出現回数/)
  assert.throws(() => createBarChartFromProvider('enemy-defense-resistance', { ...context, countMode: 'MAPS' }), /出現回数/)
})

test('全値0、有効データなし、分母0を区別し、不明な提供元や利用できない本編出現回数を拒否する', () => {
  const zero = createBarChartFromProvider('enemy-stat-histogram', {
    ...context, data: { ...context.data, rows: [enemy('a', 0, 0)] },
  })
  assert.equal(zero.bins[0].value, 1.75)
  assert.equal(zero.bins[0].share, 1)
  assert.equal(zero.bins.at(-1).cumulativeShare, 1)
  const missing = createBarChartFromProvider('enemy-stat-histogram', {
    ...context, data: { ...context.data, rows: [enemy('a', 0, null)] },
  })
  assert.equal(missing.source.population.valid, 0)
  assert.equal(missing.source.population.missing, 1.75)
  assert.ok(missing.bins.every(bin => bin.share === null && bin.cumulativeShare === null))
  const empty = createBarChartFromProvider('enemy-defense-resistance', { ...context, data: { ...context.data, rows: [] } })
  assert.deepEqual(empty.bins, [])
  assert.equal(empty.source.population.valid, 0)
  assert.throws(() => createBarChartFromProvider('unknown', context), /取得元/)
  for (const id of BAR_CHART_PROVIDERS.map(provider => provider.id)) {
    assert.throws(() => createBarChartFromProvider(id, { ...context, scope: 'main' }), /メインストーリーの出現回数/)
  }
})

test('計算結果はJSONで持ち運べる固定スナップショットとなり、元データの後続編集で変わらない', () => {
  const mutable = structuredClone(context)
  const document = createBarChartFromProvider('enemy-stat-histogram', mutable)
  const captured = JSON.stringify(document)
  mutable.data.rows[0].stats.magicResistance = 99
  mutable.data.counts.enemies.a.spawnCount = 999
  mutable.version.label = '変更後'
  assert.equal(JSON.stringify(document), captured)
  assert.deepEqual(JSON.parse(captured), document)
  assert.ok(Object.isFrozen(document) && Object.isFrozen(document.bins) && Object.isFrozen(document.bins[0]))
  assert.ok(Object.isFrozen(document.source.population))
  const changed = createBarChartFromProvider('enemy-stat-histogram', mutable)
  assert.notEqual(changed.id, document.id)
})

test('保存名は有効な表示だけを記録し、タイトルと集計条件を同じデータから使う', () => {
  const document = histogram()
  assert.match(getBarChartFilename(document, settings, 16 / 9), /集計v12.*全体.*出現回数/)
  assert.match(getBarChartFilename(document, settings, 16 / 9), /割合帯.*累積割合.*比率16x9\.png$/)
  assert.equal(getBarChartFilename(document, settings, 32 / 18), getBarChartFilename(document, settings, 16 / 9))
  const point = correspondence()
  assert.equal(getBarChartFilename(point, settings), getBarChartFilename(point, { ...settings, percent: false, cumulative: false }))
  assert.doesNotMatch(getBarChartFilename(point, settings), /割合帯|累積割合/)
  assert.match(point.conditions, /防御力・術耐性の両方が有効/)
  assert.notEqual(getBarChartFilename(document, settings), getBarChartFilename(document, { ...settings, values: false }))
})

test('累積割合の線・帯と評価帯を保存名で区別し、利用できない帯は持越設定から出力しない', () => {
  const document = histogram()
  const off = { ...settings, percent: false, cumulative: false, cumulativeBand: false, rankBand: false }
  const base = getBarChartFilename(document, off)
  const line = getBarChartFilename(document, { ...off, cumulative: true })
  const band = getBarChartFilename(document, { ...off, cumulativeBand: true })
  const ranks = getBarChartFilename(document, { ...off, rankBand: true })
  assert.notEqual(line, band)
  assert.match(band, /累積割合帯/)
  assert.doesNotMatch(band, /累積割合線/)
  assert.match(ranks, /評価帯/)
  assert.doesNotMatch(base, /累積割合|評価帯/)
  for (const statKey of ['moveSpeed', 'baseAttackTime', 'massLevel']) {
    const unsupported = createBarChartFromProvider('enemy-stat-histogram', { ...context, statKey })
    assert.equal(getBarChartFilename(unsupported, { ...off, rankBand: true }), getBarChartFilename(unsupported, off))
    assert.doesNotMatch(getBarChartFilename(unsupported, { ...off, rankBand: true }), /評価帯/)
  }
  const point = correspondence()
  assert.equal(getBarChartFilename(point, { ...off, cumulative: true, cumulativeBand: true, rankBand: true }), getBarChartFilename(point, off))
})

test('術耐性の端点評価を隣の評価に併記し、評価帯を切り離したJSONスナップショットへ保存する', () => {
  const document = histogram()
  assert.equal(document.rankBands[0].rating, 'E・D')
  assert.equal(document.rankBands.at(-1).rating, 'S+・SS')
  assert.ok(document.rankBands.every(band => band.end > band.start && band.start >= 0 && band.end <= 1))
  assert.ok(Object.isFrozen(document.rankBands) && Object.isFrozen(document.rankBands[0]))
  const input = { ...inputOf(document), rankBands: structuredClone(document.rankBands) }
  const detached = createBarChartDocument(input)
  const captured = JSON.stringify(detached)
  input.rankBands[0].rating = '変更後'
  assert.equal(JSON.stringify(detached), captured)
  assert.deepEqual(JSON.parse(captured), detached)
  assert.throws(() => createBarChartDocument({ ...input, rankBands: [{ ...document.rankBands[0], start: NaN }] }))
  assert.throws(() => createBarChartDocument({ ...input, rankBands: [{ ...document.rankBands[0], end: 1.5 }] }))
})

test('ゲーム内評価の階級は0と境界値の包含を保ち、空の評価と小数度数を残す', () => {
  const values = [0, Number.EPSILON, 10, 20, 30, 50, 60, 70, 80, 90, 90.01, null, NaN]
  const endpointRows = values.map((magicResistance, index) => enemy(String(index), 0, magicResistance))
  const weights = [1.75, .25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3]
  const endpointCounts = { ...counts, enemies: Object.fromEntries(weights.map((spawnCount, index) => [String(index), { mapCount: 1, spawnCount }])) }
  const input = { ...context, data: { ...context.data, rows: endpointRows, counts: endpointCounts }, histogramBinning: 'rating' }
  const document = createBarChartFromProvider('enemy-stat-histogram', input)
  assert.deepEqual(document.bins.map(bin => bin.label), ratingOrder)
  assert.deepEqual(document.bins.map(bin => bin.value), [1.75, .25, 1, 1, 1, 1, 1, 1, 2, 1])
  assert.equal(document.source.population.valid, 11)
  assert.equal(document.source.population.missing, 5)
  assert.equal(document.source.population.total, 16)
  assert.equal(document.bins[0].share, 1.75 / 11)
  assert.equal(document.bins.at(-1).cumulativeShare, 1)
  assert.deepEqual(document.bins.map(bin => bin.interval), getEnemyRatingNumericRanges('magicResistance').map(range => ({
    start: range.lowerBound, end: range.upperBound,
    includesMinimum: range.lowerInclusive, includesMaximum: range.upperInclusive,
    isOverflow: range.upperBound === null,
  })))
  assert.equal(document.xKind, 'interval')
  assert.equal(document.capabilities.rankBands, false)
  assert.equal(document.rankBands?.length ?? 0, 0)
  assert.equal(document.semantics.xQualifier, 'ゲーム内評価')
  assert.equal(document.semantics.xBandTitle, '評価')
  assert.equal(document.xAxisTitle, '術耐性（ゲーム内評価）')
  assert.equal(document.secondaryAxisBand.title, '範囲')
  assert.deepEqual(document.secondaryAxisBand.labels,
    getEnemyRatingNumericRanges('magicResistance').map(formatHistogramRatingRangeLines))
  assert.ok(Object.isFrozen(document.secondaryAxisBand) && Object.isFrozen(document.secondaryAxisBand.labels)
    && Object.isFrozen(document.secondaryAxisBand.labels[0]))
  const captured = JSON.stringify(document)
  input.histogramBinning = 'numeric'
  assert.notEqual(createBarChartFromProvider('enemy-stat-histogram', input).id, document.id)
  assert.equal(JSON.stringify(document), captured)
  assert.deepEqual(JSON.parse(captured), document)
  for (const statKey of ['moveSpeed', 'baseAttackTime', 'massLevel']) {
    assert.throws(() => createBarChartFromProvider('enemy-stat-histogram', { ...context, statKey, histogramBinning: 'rating' }))
  }
  assert.throws(() => createBarChartFromProvider('enemy-stat-histogram', { ...context, histogramBinning: 'unknown' }))
})

test('評価階級の空データはE〜SSを0件で保ち、割合の分母0を欠損と区別する', () => {
  const missing = createBarChartFromProvider('enemy-stat-histogram', {
    ...context, histogramBinning: 'rating', data: { ...context.data, rows: [enemy('a', 0, null)] },
  })
  assert.deepEqual(missing.bins.map(bin => bin.label), ratingOrder)
  assert.ok(missing.bins.every(bin => bin.value === 0 && bin.share === null && bin.cumulativeShare === null))
  assert.equal(missing.source.population.missing, 1.75)
  const onlyZero = createBarChartFromProvider('enemy-stat-histogram', {
    ...context, histogramBinning: 'rating', data: { ...context.data, rows: [enemy('a', 0, 0)] },
  })
  assert.equal(onlyZero.bins[0].value, 1.75)
  assert.equal(onlyZero.bins[0].share, 1)
  assert.ok(onlyZero.bins.slice(1).every(bin => bin.value === 0 && bin.share === 0 && bin.cumulativeShare === 1))
  const empty = createBarChartFromProvider('enemy-stat-histogram', {
    ...context, histogramBinning: 'rating', data: { ...context.data, rows: [] },
  })
  assert.equal(empty.source.population.total, 0)
  assert.equal(empty.bins.length, 10)
})

test('評価階級の保存名・条件は数値階級と区別し、追加評価帯は持ち越しても記録しない', () => {
  const numeric = histogram()
  const rating = createBarChartFromProvider('enemy-stat-histogram', { ...context, histogramBinning: 'rating' })
  assert.deepEqual(createBarChartFromProvider('enemy-stat-histogram', { ...context, histogramBinning: 'numeric' }), numeric)
  assert.notEqual(rating.id, numeric.id)
  assert.notEqual(getBarChartFilename(rating, settings), getBarChartFilename(numeric, settings))
  assert.match(rating.conditions, /ゲーム内評価/)
  assert.match(getBarChartFilename(rating, settings), /ゲーム内評価/)
  assert.equal(getBarChartFilename(rating, { ...settings, rankBand: true }), getBarChartFilename(rating, { ...settings, rankBand: false }))
  assert.doesNotMatch(getBarChartFilename(rating, { ...settings, rankBand: true }), /評価帯/)
})

test('共通契約は不正な数値・重複階級・欠けた区間を拒否し、カテゴリ名は提供元の順序を保つ', () => {
  const input = inputOf(histogram())
  for (const bins of [
    [{ ...input.bins[0], value: NaN }],
    [input.bins[0], input.bins[0]],
    [{ ...input.bins[0], interval: undefined }],
    [{ ...input.bins[0], share: 1.1 }],
  ]) assert.throws(() => createBarChartDocument({ ...input, bins }), /階級と値/)
  assert.throws(() => createBarChartDocument({ ...input, fractionDigits: Infinity }), /集計値/)
  const categories = createBarChartDocument({ ...input, xKind: 'category', bins: [
    { id: 'zero', label: 'ゼロ', value: 0 }, { id: 'missing', label: '未計算', value: null },
  ] })
  assert.deepEqual(categories.bins.map(bin => [bin.label, bin.value]), [['ゼロ', 0], ['未計算', null]])
})

test('v12メインストーリー出現回数の度数・欠損・防御力対応を既存の固定版計算と一致させる', async () => {
  const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1), folder))) })
  const { versions } = await client.loadIndex()
  const version = versions.find(item => item.id === 'v12')
  assert.ok(version)
  const data = await client.loadVersion(version)
  const scoped = getEnemyMainStoryScope(data)
  const document = createBarChartFromProvider('enemy-stat-histogram', { data, version, scope: 'main' })
  const expected = calculateWeightedHistogram(buildEnemyHistogramObservations(scoped.rows, row => row.stats.magicResistance, 'SPAWNS', scoped.counts), {
    scale: 'LINEAR', minimumLinearBinWidth: 1, customLinearBinWidth: 10, minimumLinearUpperBound: 100,
  })
  assert.equal(document.source.population.valid, 11_409)
  assert.equal(document.source.population.missing, 201)
  assert.deepEqual(document.bins.map(bin => bin.value), [3549, 485, 3521, 1279, 718, 1436, 304, 3, 50, 64])
  assert.deepEqual(document.bins.map(bin => bin.value), expected.bins.map(bin => bin.count))
  assert.equal(document.bins.at(-1).cumulativeShare, 1)
  assert.equal(document.source.aggregationVersion.sourceRevision, version.sourceRevision)
  const resistanceRatings = createBarChartFromProvider('enemy-stat-histogram', { data, version, scope: 'main', histogramBinning: 'rating' })
  assert.deepEqual(resistanceRatings.bins.map(bin => bin.value), [3549, 0, 485, 3521, 1997, 1436, 304, 3, 114, 0])
  const statExpectations = {
    maxHp: [11610, 0, 5000, 50000], attack: [11610, 0, 200, 2000], defense: [11409, 201, 200, 2000],
    magicResistance: [11409, 201, 10, 100], moveSpeed: [11610, 0, .2, 2],
    baseAttackTime: [11408, 202, .5, 5], massLevel: [11398, 212, 1, 10],
  }
  for (const metric of ENEMY_STAT_METRICS) {
    const selected = createBarChartFromProvider('enemy-stat-histogram', { data, version, scope: 'main', statKey: metric.key })
    const [valid, missing, width, upper] = statExpectations[metric.key]
    const expectedStat = calculateWeightedHistogram(buildEnemyHistogramObservations(scoped.rows, row => row.stats[metric.key], 'SPAWNS', scoped.counts), {
      scale: 'LINEAR', minimumLinearBinWidth: metric.minimumLinearBinWidth,
      ...(metric.key === 'magicResistance' ? { customLinearBinWidth: 10, minimumLinearUpperBound: 100 } : {}),
    })
    assert.equal(selected.source.population.valid, valid, `${metric.label}の有効度数`)
    assert.equal(selected.source.population.missing, missing, `${metric.label}自身の欠損だけを除外する`)
    assert.equal(selected.source.population.total, 11610)
    assert.equal(selected.source.aggregationScope, 'main')
    assert.equal(selected.bins.reduce((sum, bin) => sum + bin.value, 0), valid)
    assert.equal(expectedStat.histogram.binWidth, width)
    assert.equal(expectedStat.histogram.normalRangeEnd, upper)
    assert.equal(selected.source.parameters.find(parameter => parameter.label === '階級幅').value,
      `${metric.key === 'magicResistance' ? '' : '自動 '}${width.toLocaleString('ja-JP')}`)
    assert.equal(selected.source.parameters.find(parameter => parameter.label === '上限').value, `自動 ${upper.toLocaleString('ja-JP')}`)
    assert.deepEqual(selected.bins.map(bin => bin.value), expectedStat.bins.map(bin => bin.count))
    assert.deepEqual(selected.bins.map(bin => bin.interval), expectedStat.bins.map(bin => ({
      start: bin.start, end: bin.isOverflow ? null : bin.end,
      includesMinimum: !bin.isOverflow, includesMaximum: !bin.isOverflow && bin.includesMaximum, isOverflow: !!bin.isOverflow,
    })))
    assert.ok(Math.abs(selected.bins.reduce((sum, bin) => sum + bin.share, 0) - 1) < 1e-12)
    assert.equal(selected.bins.at(-1).cumulativeShare, 1)
    const hasRanks = ['maxHp', 'attack', 'defense', 'magicResistance'].includes(metric.key)
    assert.equal(Boolean(selected.capabilities.rankBands), hasRanks)
    if (hasRanks) {
      const rating = createBarChartFromProvider('enemy-stat-histogram', { data, version, scope: 'main', statKey: metric.key, histogramBinning: 'rating' })
      const expectedRatings = buildEnemyRatingHistogramBins(buildEnemyHistogramObservations(scoped.rows,
        row => row.stats[metric.key], 'SPAWNS', scoped.counts), metric.key)
      assert.deepEqual(rating.bins.map(bin => bin.label), ratingOrder)
      assert.deepEqual(rating.bins.map(bin => bin.value), expectedRatings.map(bin => bin.count))
      assert.deepEqual(rating.source.population, selected.source.population)
      assert.equal(rating.bins.reduce((sum, bin) => sum + bin.value, 0), valid)
      assert.ok(Math.abs(rating.bins.reduce((sum, bin) => sum + bin.share, 0) - 1) < 1e-12)
      assert.equal(rating.bins.at(-1).cumulativeShare, 1)
      assert.deepEqual(rating.secondaryAxisBand.labels, expectedRatings.map(formatHistogramRatingRangeLines))
      assert.equal(rating.capabilities.rankBands, false)
      assert.deepEqual(selected.rankBands, getHistogramStatRankBands(metric.key, expectedStat.bins, 'LINEAR'))
      assert.ok(Object.isFrozen(selected.rankBands))
      if (expectedStat.bins.at(-1).isOverflow) {
        const overflow = selected.rankBands.at(-1)
        assert.equal(overflow.end, 1)
        assert.ok(overflow.start >= (selected.bins.length - 1) / selected.bins.length - 1e-10,
          '上限超過階級の評価は観測値の最大ではなく同じ超過列へ割り当てる')
      }
    } else assert.equal(selected.rankBands?.length ?? 0, 0)
  }
  const point = createBarChartFromProvider('enemy-defense-resistance', { data, version, scope: 'main' })
  assert.deepEqual(point.bins.map(bin => bin.value), buildEnemyDefenseResistanceBands(scoped.rows, scoped.counts)
    .resistanceThresholds.map(row => row.defense))
})

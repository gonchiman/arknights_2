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
const histogram = () => createBarChartFromProvider('enemy-resistance-histogram', context)
const correspondence = () => createBarChartFromProvider('enemy-defense-resistance', context)
const inputOf = document => Object.fromEntries(['xKind', 'bins', 'filenameParts', 'fractionDigits', 'capabilities', 'semantics', 'source']
  .map(key => [key, document[key]]))
const settings = { values: true, axisBand: true, percent: true, cumulative: true }

test('提供元は既存の度数と階級の意味を保持し、同じ入力から同じタイトルとデータを返す', () => {
  const original = structuredClone(context)
  const document = histogram()
  assert.equal(BAR_CHART_PROVIDERS.length, 2)
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
  assert.deepEqual(document.capabilities, { percentages: true, cumulative: true })
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
  assert.deepEqual(document.capabilities, { percentages: false, cumulative: false })
  assert.throws(() => createBarChartFromProvider('enemy-defense-resistance', { ...context, countMode: 'TYPES' }), /出現回数/)
  assert.throws(() => createBarChartFromProvider('enemy-defense-resistance', { ...context, countMode: 'MAPS' }), /出現回数/)
})

test('全値0、有効データなし、分母0を区別し、不明な提供元や利用できない本編出現回数を拒否する', () => {
  const zero = createBarChartFromProvider('enemy-resistance-histogram', {
    ...context, data: { ...context.data, rows: [enemy('a', 0, 0)] },
  })
  assert.equal(zero.bins[0].value, 1.75)
  assert.equal(zero.bins[0].share, 1)
  assert.equal(zero.bins.at(-1).cumulativeShare, 1)
  const missing = createBarChartFromProvider('enemy-resistance-histogram', {
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
  const document = createBarChartFromProvider('enemy-resistance-histogram', mutable)
  const captured = JSON.stringify(document)
  mutable.data.rows[0].stats.magicResistance = 99
  mutable.data.counts.enemies.a.spawnCount = 999
  mutable.version.label = '変更後'
  assert.equal(JSON.stringify(document), captured)
  assert.deepEqual(JSON.parse(captured), document)
  assert.ok(Object.isFrozen(document) && Object.isFrozen(document.bins) && Object.isFrozen(document.bins[0]))
  assert.ok(Object.isFrozen(document.source.population))
  const changed = createBarChartFromProvider('enemy-resistance-histogram', mutable)
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
  const document = createBarChartFromProvider('enemy-resistance-histogram', { data, version, scope: 'main' })
  const expected = calculateWeightedHistogram(buildEnemyHistogramObservations(scoped.rows, row => row.stats.magicResistance, 'SPAWNS', scoped.counts), {
    scale: 'LINEAR', minimumLinearBinWidth: 1, customLinearBinWidth: 10, minimumLinearUpperBound: 100,
  })
  assert.equal(document.source.population.valid, 11_409)
  assert.equal(document.source.population.missing, 201)
  assert.deepEqual(document.bins.map(bin => bin.value), [3549, 485, 3521, 1279, 718, 1436, 304, 3, 50, 64])
  assert.deepEqual(document.bins.map(bin => bin.value), expected.bins.map(bin => bin.count))
  assert.equal(document.bins.at(-1).cumulativeShare, 1)
  assert.equal(document.source.aggregationVersion.sourceRevision, version.sourceRevision)
  const point = createBarChartFromProvider('enemy-defense-resistance', { data, version, scope: 'main' })
  assert.deepEqual(point.bins.map(bin => bin.value), buildEnemyDefenseResistanceBands(scoped.rows, scoped.counts)
    .resistanceThresholds.map(row => row.defense))
})

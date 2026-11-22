import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildBarChartImageVariants, createBarChartImageSnapshot, getBarChartArchiveFilename,
} from '../src/lib/barChartImage.ts'
import { createBarChartFromProvider, createBarChartProviderVariants } from '../src/lib/barChartProviders.ts'
import {
  getBarChartComparisonSelection, getBarChartFilename, getBarChartSelectionSummary, toggleBarChartHighlight,
} from '../src/lib/barChartDocument.ts'
import { CHART_IMAGE_FILENAME_BYTE_LIMIT } from '../src/lib/chartImageFilename.ts'
import { ENEMY_RANK_BAND_STATISTIC_LABELS } from '../src/lib/enemyRankBandStatisticsDisplay.ts'

const metricKeys = ['min', 'max', 'width', 'mean', 'standardDeviation', 'variance']
const version = { id: 'v12', label: '集計版 v12', sourceRevision: 'a'.repeat(40), ruleVersion: 'fixture' }
const enemy = (id, defense, magicResistance) => ({ id, stats: { defense, magicResistance } })
const rows = [enemy('a', 1000, 60), enemy('b', 500, 30), enemy('c', 100, 10), enemy('d', 0, 0),
  enemy('missing', null, 90)]
const counts = { schemaVersion: 1, generatedAt: 'fixture', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: { a: { mapCount: 1, spawnCount: 1.5 }, b: { mapCount: 1, spawnCount: 2.5 },
    c: { mapCount: 1, spawnCount: 3 }, d: { mapCount: 1, spawnCount: 3 }, missing: { mapCount: 1, spawnCount: 2 } } }
const context = { data: { rows, counts, mainStoryCounts: counts, maps: { maps: [] } }, version,
  scope: 'all', rankBandStep: 20 }
const settingsFor = () => ({ values: true, axisBand: true, percent: false, cumulative: false,
  comparisonBand: 'value', selectedRanks: ['rank-band-0-20', 'rank-band-20-40'] })
const documentFor = (rankBandMetric, overrides = {}) => createBarChartFromProvider('enemy-rank-band-statistics', {
  ...context, rankBandMetric, ...overrides,
})
const variantsFor = () => metricKeys.map(key => ({ key, label: ENEMY_RANK_BAND_STATISTIC_LABELS[key], document: documentFor(key) }))
const fixture = () => createBarChartImageSnapshot(documentFor('standardDeviation'), settingsFor(), variantsFor())

test('保存開始時に現在の画像・全候補・表示設定を独立したJSONデータとして固定する', () => {
  const document = structuredClone(documentFor('standardDeviation'))
  const variants = structuredClone(variantsFor())
  const settings = settingsFor()
  const before = { document: structuredClone(document), variants: structuredClone(variants), settings: structuredClone(settings) }
  const snapshot = createBarChartImageSnapshot(document, settings, variants)
  const captured = JSON.stringify(snapshot)

  assert.deepEqual(snapshot.document, before.document)
  assert.deepEqual(snapshot.variants, before.variants)
  assert.deepEqual(snapshot.settings, before.settings)
  assert.notEqual(snapshot.document, document)
  assert.notEqual(snapshot.variants, variants)
  assert.notEqual(snapshot.settings.selectedRanks, settings.selectedRanks)
  for (const value of [snapshot, snapshot.document, snapshot.document.series[0].bins[0], snapshot.variants,
    snapshot.variants[0], snapshot.variants[0].document.series[0].bins[0], snapshot.settings, snapshot.settings.selectedRanks]) {
    assert.ok(Object.isFrozen(value))
  }
  assert.equal(Object.isFrozen(document), false, '呼び出し元の可変データを凍結しない')
  assert.equal(Object.isFrozen(variants), false)
  assert.equal(Object.isFrozen(settings), false)
  document.title = '変更後のタイトル'
  document.series[0].bins[0].value = 999
  variants[0].label = '変更後の候補'
  variants[0].document.series[0].bins[0].value = 999
  variants.pop()
  settings.selectedRanks.push('rank-band-40-60')
  settings.comparisonBand = 'none'
  assert.equal(JSON.stringify(snapshot), captured)
  assert.deepEqual(JSON.parse(captured), snapshot)
})

test('複数選択は提供元の順序で重複と未知キーを除き、現在の単体画像を変更しない', () => {
  const snapshot = fixture()
  const captured = JSON.stringify(snapshot)
  const selected = buildBarChartImageVariants(snapshot, ['variance', 'mean', 'not-a-metric', 'min', 'mean', 'variance'])
  assert.deepEqual(selected.map(variant => variant.key), ['min', 'mean', 'variance'])
  assert.deepEqual(selected.map(variant => variant.label), ['最小', '平均', '分散'])
  for (const variant of selected) {
    const expected = snapshot.variants.find(item => item.key === variant.key)
    assert.deepEqual(variant.snapshot.document, expected.document)
    assert.deepEqual(variant.snapshot.settings, snapshot.settings)
    assert.ok(Object.isFrozen(variant.snapshot))
    assert.ok(Object.isFrozen(variant.snapshot.settings.selectedRanks))
    assert.equal(variant.snapshot.document.source.aggregationVersion.id, 'v12')
    assert.equal(variant.snapshot.document.source.aggregationScope, 'all')
    assert.equal(variant.snapshot.document.bins.length, 5, '現在の20ポイントの順位帯を維持する')
    assert.ok(variant.snapshot.document.conditions.includes('20ポイント'))
    assert.equal(variant.snapshot.document.source.countMode, 'SPAWNS')
  }
  assert.equal(snapshot.document.semantics.xLabel, '標準偏差')
  assert.equal(JSON.stringify(snapshot), captured)
  assert.deepEqual(buildBarChartImageVariants(snapshot, []), [])
  assert.deepEqual(buildBarChartImageVariants(snapshot, ['not-a-metric']), [])
})

test('単体保存のスナップショットも継続でき、候補を添えない場合は画像を捏造しない', () => {
  const document = createBarChartFromProvider('enemy-stat-histogram', { ...context, statKey: 'magicResistance' })
  const snapshot = createBarChartImageSnapshot(document, settingsFor())
  assert.deepEqual(snapshot.document, document)
  assert.deepEqual(buildBarChartImageVariants(snapshot, metricKeys), [])
  assert.match(getBarChartFilename(snapshot.document, snapshot.settings, 16 / 9), /\.png$/)
})

function providerSnapshot(source, extra = {}) {
  const selected = { ...context, ...extra }
  return createBarChartImageSnapshot(createBarChartFromProvider(source, selected), settingsFor(),
    createBarChartProviderVariants(source, selected))
}

const archiveFor = (snapshot, keys) => getBarChartArchiveFilename(snapshot, buildBarChartImageVariants(snapshot, keys), 16 / 9)

test('左右の片側の強調と両側の強調を同じ項目で切り替えられる', () => {
  const { document, settings } = providerSnapshot('enemy-stat-rating-comparison')
  const id = 'rating-E'
  const getSelection = current => {
    const { left, right } = getBarChartComparisonSelection(document, current)
    return [[...left], [...right]]
  }
  const leftOnly = toggleBarChartHighlight(settings, id, 'left')
  assert.deepEqual(getSelection(settings), [[], []])
  assert.deepEqual(getSelection(leftOnly), [[id], []])
  const both = toggleBarChartHighlight(leftOnly, id, 'right')
  assert.deepEqual(getSelection(both), [[id], [id]])
  const rightOnly = toggleBarChartHighlight(both, id, 'left')
  assert.deepEqual(getSelection(rightOnly), [[], [id]])
  const simultaneous = toggleBarChartHighlight(rightOnly, id, 'both')
  assert.deepEqual(getSelection(simultaneous), [[id], [id]])
  assert.deepEqual(getSelection(toggleBarChartHighlight(simultaneous, id, 'both')), [[], []])
  assert.deepEqual(getSelection(toggleBarChartHighlight(rightOnly, 'rating-A')),
    [['rating-A'], [id, 'rating-A']], '縦棒からの操作は片側の設定を消さない')
})

test('評価別比較の選択合計は左右の強調項目から求め、0件と未選択を区別する', () => {
  const { document } = providerSnapshot('enemy-stat-rating-comparison',
    { leftStatKey: 'defense', rightStatKey: 'magicResistance' })
  const summary = getBarChartSelectionSummary(document, ['rating-E'], { left: ['rating-A'], right: ['stale-id'] })
  assert.equal(summary.label, '左E・A・右E')
  assert.deepEqual(summary.series.map(series => series.selectionLabel), ['E・A', 'E'])
  for (const [i, series] of document.series.entries()) {
    const ids = i === 0 ? ['rating-E', 'rating-A'] : ['rating-E']
    const count = series.bins.filter(bin => ids.includes(bin.id)).reduce((total, bin) => total + bin.value, 0)
    assert.equal(summary.series[i].count, count)
    assert.equal(summary.series[i].share, count / series.population.valid)
  }
  const zeroCount = getBarChartSelectionSummary(document, [], { left: ['rating-SS'] })
  assert.deepEqual(zeroCount.series.map(series => [series.selectionLabel, series.share]), [['SS', 0], [null, null]])
  assert.equal(getBarChartSelectionSummary(document, [], { right: ['stale-id'] }), null)
})

test('左右で項目が異なる強調をPNGと共通ZIP名へ固定し、同じ項目なら従来名を使う', () => {
  const source = providerSnapshot('enemy-stat-rating-comparison')
  const snapshotWith = display => createBarChartImageSnapshot(source.document, { ...source.settings, ...display },
    source.variants)
  const keys = ['maxHp-maxHp', 'maxHp-defense']
  const filename = snapshot => getBarChartFilename(snapshot.document, snapshot.settings, 16 / 9)
  const requested = { left: ['rating-E'], right: ['rating-A', 'stale-id'] }
  const asymmetric = snapshotWith({ comparisonSelection: requested })
  requested.left.push('rating-C')
  assert.ok(Object.isFrozen(asymmetric.settings.comparisonSelection.left))
  assert.match(filename(asymmetric), /左E・右A強調/)
  assert.match(archiveFor(asymmetric, keys), /左E・右A強調/)
  const reversed = snapshotWith({ comparisonSelection: { left: ['rating-A'], right: ['rating-E'] } })
  assert.notEqual(filename(asymmetric), filename(reversed))
  assert.notEqual(archiveFor(asymmetric, keys), archiveFor(reversed, keys))
  const identical = snapshotWith({ comparisonSelection: { left: ['rating-A'], right: ['rating-A'] } })
  const shared = snapshotWith({ selectedRanks: ['rating-A'] })
  assert.equal(filename(identical), filename(shared))
  assert.equal(archiveFor(identical, keys), archiveFor(shared, keys))
  assert.match(filename(shared), /評価A強調/)
})

test('分布のZIP名は数値とゲーム内評価を区別し、単体PNGも選択ステータスへ一致する', () => {
  const numeric = providerSnapshot('enemy-stat-histogram', { histogramBinning: 'numeric' })
  const rating = providerSnapshot('enemy-stat-histogram', { histogramBinning: 'rating' })
  const keys = ['defense', 'magicResistance']
  const numericName = archiveFor(numeric, keys), ratingName = archiveFor(rating, keys)
  assert.notEqual(numericName, ratingName)
  assert.match(numericName, /敵のステータス分布/)
  assert.match(numericName, /数値階級/)
  assert.match(ratingName, /ゲーム内評価/)
  assert.match(numericName, /防御力/)
  assert.match(numericName, /術耐性/)
  assert.match(numericName, /2枚/)
  for (const snapshot of [numeric, rating]) {
    const [chosen] = buildBarChartImageVariants(snapshot, ['defense'])
    assert.equal(chosen.snapshot.document.semantics.metricKey, 'defense')
    const filename = getBarChartFilename(chosen.snapshot.document, chosen.snapshot.settings, 16 / 9)
    assert.match(filename, /防御力のヒストグラム/)
    assert.match(filename, /比率16x9\.png$/)
  }
})

test('数値階級の強調は境界が同じ別ステータスへ移らず、評価の強調は共有される', () => {
  const sameValues = { ...context.data, rows: rows.map(row =>
    ({ ...row, stats: { ...row.stats, attack: row.stats.defense } })) }
  const sourceId = 'enemy-stat-histogram'
  const makeSnapshot = (histogramBinning, label) => {
    const input = { ...context, data: sameValues, statKey: 'defense', histogramBinning }
    const document = createBarChartFromProvider(sourceId, input)
    const bin = document.bins.find(bin => label === undefined || bin.label === label)
    return createBarChartImageSnapshot(document, { ...settingsFor(), selectedRanks: [bin.id, 'stale-id'] },
      createBarChartProviderVariants(sourceId, input))
  }
  const keys = ['attack', 'defense']
  const filenames = snapshot => Object.fromEntries(buildBarChartImageVariants(snapshot, keys).map(({ key, snapshot }) =>
    [key, getBarChartFilename(snapshot.document, snapshot.settings, 16 / 9)]))
  const numeric = makeSnapshot('numeric')
  const attackBins = numeric.variants.find(variant => variant.key === 'attack').document.bins
  assert.deepEqual(attackBins.map(bin => bin.interval), numeric.document.bins.map(bin => bin.interval))
  assert.match(filenames(numeric).defense, /強調/)
  assert.doesNotMatch(filenames(numeric).attack, /強調/)
  assert.doesNotMatch(archiveFor(numeric, keys), /強調/)
  assert.equal(getBarChartFilename(numeric.document, numeric.settings),
    getBarChartFilename(numeric.document, { ...numeric.settings, selectedRanks: numeric.settings.selectedRanks.slice(0, 1) }))

  const rating = makeSnapshot('rating', 'A')
  assert.match(filenames(rating).defense, /A強調/)
  assert.match(filenames(rating).attack, /A強調/)
  assert.match(archiveFor(rating, keys), /A強調/)
})

test('同じ左右の集合でもペア関係が異なるZIP名と全16組の名を区別する', () => {
  const snapshot = providerSnapshot('enemy-stat-rating-comparison')
  const sameMetric = ['defense-defense', 'magicResistance-magicResistance']
  const differentMetric = ['defense-magicResistance', 'magicResistance-defense']
  const sameName = archiveFor(snapshot, sameMetric), differentName = archiveFor(snapshot, differentMetric)
  assert.notEqual(sameName, differentName, '左候補集合と右候補集合だけへ圧縮してペアの組み方を消さない')
  assert.equal(sameName, archiveFor(snapshot, [...sameMetric].reverse()))
  assert.match(sameName, /敵ステータスの評価別比較/)
  assert.match(differentName, /2枚/)
  assert.notEqual(differentName, archiveFor(providerSnapshot('enemy-stat-histogram'), ['defense', 'magicResistance']))
  const allName = archiveFor(snapshot, snapshot.variants.map(variant => variant.key))
  assert.match(allName, /16枚/)
  assert.match(allName, /全組み合わせ/)
  assert.notEqual(allName, sameName)
  for (const name of [sameName, differentName, allName]) {
    assert.match(name, /集計v12/)
    assert.match(name, /全体/)
    assert.match(name, /比率16x9\.zip$/)
    assert.ok(new TextEncoder().encode(name).length <= CHART_IMAGE_FILENAME_BYTE_LIMIT)
  }
  const chosen = buildBarChartImageVariants(snapshot, ['magicResistance-defense'])
  assert.equal(chosen.length, 1)
  assert.deepEqual(chosen[0].snapshot.document.series.map(series => series.metricKey), ['magicResistance', 'defense'])
})

test('対応関係の候補は範囲ごとに固定され、フォルダ用PNG名とZIP名も範囲を識別する', () => {
  const snapshot = providerSnapshot('enemy-defense-resistance')
  const selected = buildBarChartImageVariants(snapshot, ['main', 'all', 'main'])
  assert.deepEqual(selected.map(variant => variant.key), ['all', 'main'])
  assert.deepEqual(selected.map(variant => variant.snapshot.document.source.aggregationScope), ['all', 'main'])
  const names = selected.map(variant => getBarChartFilename(variant.snapshot.document, variant.snapshot.settings, 16 / 9))
  assert.equal(new Set(names).size, 2)
  assert.match(names[0], /全体/)
  assert.match(names[1], /メインストーリー/)
  const name = getBarChartArchiveFilename(snapshot, selected, 16 / 9)
  assert.match(name, /防御力と術耐性の対応/)
  assert.match(name, /2枚/)
  assert.match(name, /全体/)
  assert.match(name, /メインストーリー/)
  assert.match(name, /術耐性10刻み/)
  assert.match(name, /比率16x9\.zip$/)
})

test('一枚の選択でも選んだ統計量のPNG名を使い、六枚の名前が衝突しない', () => {
  const snapshot = fixture()
  const variants = buildBarChartImageVariants(snapshot, metricKeys)
  const names = variants.map(variant => getBarChartFilename(variant.snapshot.document, variant.snapshot.settings, 16 / 9))
  assert.equal(variants.length, 6)
  assert.equal(new Set(names).size, 6)
  for (const [index, variant] of variants.entries()) {
    assert.ok(names[index].includes(variant.label))
    assert.match(names[index], /順位帯20ポイント/)
    assert.match(names[index], /集計v12/)
    assert.match(names[index], /全体/)
    assert.match(names[index], /比率16x9\.png$/)
    assert.ok(new TextEncoder().encode(names[index]).length <= CHART_IMAGE_FILENAME_BYTE_LIMIT)
    assert.doesNotMatch(names[index], /[<>:"/\\|?*\u0000-\u001f]/)
  }
  const [mean] = buildBarChartImageVariants(snapshot, ['mean'])
  const meanName = getBarChartFilename(mean.snapshot.document, mean.snapshot.settings, 16 / 9)
  assert.match(meanName, /順位帯別平均/)
  assert.doesNotMatch(meanName, /標準偏差|母分散/)
  const values = mean.snapshot.document.series.flatMap(series => series.bins.map(bin => bin.value))
  assert.ok(values.some(value => value < 0), '負の平均も同じ固定候補を保存する')
})

test('ZIP名は選択統計量と枚数を区別し、集計条件・比率を保持する', () => {
  const snapshot = fixture()
  const selected = buildBarChartImageVariants(snapshot, ['mean', 'variance'])
  const name = getBarChartArchiveFilename(snapshot, selected, 16 / 9)
  assert.match(name, /2枚/)
  assert.match(name, /平均/)
  assert.match(name, /分散/)
  assert.match(name, /集計v12/)
  assert.match(name, /全体/)
  assert.match(name, /順位帯20ポイント/)
  assert.match(name, /比率16x9\.zip$/)
  assert.ok(new TextEncoder().encode(name).length <= CHART_IMAGE_FILENAME_BYTE_LIMIT)
  assert.doesNotMatch(name, /[<>:"/\\|?*\u0000-\u001f]/)
  assert.equal(name, getBarChartArchiveFilename(snapshot, buildBarChartImageVariants(snapshot, ['variance', 'mean', 'mean']), 32 / 18))
  assert.notEqual(name, getBarChartArchiveFilename(snapshot, buildBarChartImageVariants(snapshot, ['min', 'max']), 16 / 9))
  assert.notEqual(name, getBarChartArchiveFilename(snapshot, buildBarChartImageVariants(snapshot, metricKeys), 16 / 9))
  assert.notEqual(name, getBarChartArchiveFilename(snapshot, selected, 16 / 7))
  assert.match(getBarChartArchiveFilename(snapshot, selected), /比率自動\.zip$/)
})

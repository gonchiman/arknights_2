import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BAR_CHART_PROVIDERS, createBarChartFromProvider, createBarChartProviderVariants } from '../src/lib/barChartProviders.ts'
import { getBarChartFilename } from '../src/lib/barChartDocument.ts'
import { ENEMY_RANK_BAND_STATISTIC_LABELS } from '../src/lib/enemyRankBandStatisticsDisplay.ts'
import { buildStandardizedEnemyRankBandStatistics } from '../src/lib/enemyRankBandStatistics.ts'
import { createEnemyAggregationClient, getEnemyMainStoryScope } from '../src/lib/enemyAggregationData.ts'
import { ENEMY_STAT_METRICS } from '../src/lib/enemyStatMetrics.ts'
import { isEnemyRatingStat } from '../src/lib/enemyRatingHistogram.ts'

const version = { id: 'v12', label: '集計版 v12', sourceRevision: 'a'.repeat(40), ruleVersion: 'fixture' }
const enemy = (id, defense, magicResistance) => ({ id, stats: {
  defense, magicResistance, maxHp: defense === null ? null : 1000 + defense * 3,
  attack: defense === null ? null : 100 + defense, moveSpeed: defense === null ? null : 0.5 + defense / 1000,
  baseAttackTime: defense === null ? null : 1.25 + defense / 1000, massLevel: defense === null ? null : defense / 100,
} })
const rows = [enemy('a', 600, 50), enemy('b', 300, 20), enemy('c', 0, 0), enemy('missing', null, 90)]
const counts = { schemaVersion: 1, generatedAt: 'fixture', sourceGeneratedAt: null,
  summary: { mapCount: 1, missingMapCount: 0, spawnMapCount: 1, spawnExcludedMapCount: 0 },
  enemies: Object.fromEntries(rows.map(({ id }, index) => [id, { mapCount: 1, spawnCount: [3.5, 2.25, 1.75, 10][index] }])) }
const context = { data: { rows, counts, mainStoryCounts: counts, maps: { maps: [] } }, version, scope: 'all' }
const id = 'enemy-rank-band-statistics'
const metrics = ['min', 'max', 'width', 'mean', 'standardDeviation', 'variance']
const variantsFor = extra => createBarChartProviderVariants(id, { ...context, ...extra })
const settings = { values: true, axisBand: true, percent: false, cumulative: false, comparisonBand: 'value' }

test('DC3優勢率は有効な1スキル1票の端数・段階別の得票・対象なしを区別して保存する', () => {
  const id = 'dc3-attribute-advantage'
  const advantageRows = [
    { resistance: 0, defense: 0, count: 3, physicalWins: 0, ties: 3, artsWins: 0,
      bySkill: { count: 2, physicalWins: 0, ties: 2, artsWins: 0 } },
    { resistance: 60, defense: 1200, count: 3, physicalWins: 1, ties: 0, artsWins: 2,
      bySkill: { count: 2, physicalWins: 0.5, ties: 0, artsWins: 1.5 } },
    { resistance: 100, defense: null, count: 0, physicalWins: 0, ties: 0, artsWins: 0,
      bySkill: { count: 0, physicalWins: 0, ties: 0, artsWins: 0 } },
  ]
  const selected = { ...context, advantageRows, advantagePolicy: 'apply', scope: 'main' }
  const variants = createBarChartProviderVariants(id, selected)
  assert.deepEqual(variants.map(item => item.key), ['skill', 'stage'])
  const [skill, stage] = variants.map(item => item.document)
  assert.deepEqual(skill, createBarChartFromProvider(id, selected))
  assert.deepEqual(stage, createBarChartFromProvider(id, { ...selected, advantageUnit: 'stage' }))
  assert.equal(skill.stack.legendTitle, 'ダメージが高い属性')
  assert.deepEqual(skill.stack.series.map(series => series.label), ['物理', '同じ', '術'])
  assert.deepEqual(skill.stack.columns, ['術耐性', '対応防御力', '有効スキル数'])
  assert.equal(stage.stack.columns[2], '有効段階数')
  assert.deepEqual(skill.stack.rows.map(row => row.values), [[0, 2, 0], [0.5, 0, 1.5], null])
  assert.deepEqual(stage.stack.rows.map(row => row.values), [[0, 3, 0], [1, 0, 2], null])
  assert.deepEqual(skill.stack.rows[1].labels, ['60', '1,200', '2'])
  assert.deepEqual(skill.stack.rows[2], { labels: ['100', '—', '0'], total: 0, values: null })
  assert.notEqual(getBarChartFilename(skill, settings, 16 / 9), getBarChartFilename(stage, settings, 16 / 9))
  assert.equal(skill.conditions, '集計版 v12 · メインストーリー · スキル単位 · 属性限定効果を適用 · 通常攻撃型')
  assert.match(createBarChartFromProvider(id, { ...context, advantageRows }).conditions, /属性限定効果.*除外/)
  assert.throws(() => createBarChartFromProvider(id, { ...context, advantageRows: [] }), /対応させる出現データがありません/)
  assert.throws(() => createBarChartProviderVariants(id, { ...context, advantageRows: [advantageRows[2]] }), /該当するスキルはありません/)
  advantageRows[0].bySkill.ties = 0
  assert.equal(skill.stack.rows[0].values[1], 2)
})

test('順位帯統計の6つの出力候補は現在の順位帯幅と単体出力を保持し、保存名を区別する', () => {
  for (const rankBandStep of [5, 10, 20]) {
    const variants = variantsFor({ rankBandStep })
    assert.deepEqual(variants.map(item => item.key), metrics)
    assert.deepEqual(variants.map(item => item.label), metrics.map(metric => ENEMY_RANK_BAND_STATISTIC_LABELS[metric]))
    const expected = buildStandardizedEnemyRankBandStatistics(rows, counts, rankBandStep)
    const filenames = new Set()
    for (const variant of variants) {
      const document = variant.document
      assert.deepEqual(document, createBarChartFromProvider(id, { ...context, rankBandStep, rankBandMetric: variant.key }))
      assert.equal(document.bins.length, 100 / rankBandStep)
      for (const [index, key] of ['defense', 'resistance'].entries()) {
        assert.deepEqual(document.series[index].bins.map(bin => bin.value), expected.bands.map(band => band[key]?.[variant.key] ?? null))
      }
      assert.ok(document.source.parameters.some(parameter => parameter.label === '順位帯' && parameter.value === `${rankBandStep}ポイント`))
      filenames.add(getBarChartFilename(document, settings, 16 / 9))
    }
    assert.equal(filenames.size, 6)
  }
  assert.deepEqual(variantsFor({ rankBandMetric: 'mean' }), variantsFor({ rankBandMetric: 'standardDeviation' }),
    '画面で選んだプレビューによって出力候補の集合を変えない')
})

test('出力候補は1回の統計計算を共有し、元データの後続変更から独立した固定スナップショットになる', () => {
  const makeContext = () => {
    let reads = 0
    const data = structuredClone(context)
    for (const row of data.data.rows) {
      const defense = row.stats.defense
      Object.defineProperty(row.stats, 'defense', { enumerable: true, get: () => { reads += 1; return defense } })
    }
    return { data, reads: () => reads }
  }
  const one = makeContext(), multiple = makeContext()
  createBarChartFromProvider(id, one.data)
  const countedVariants = createBarChartProviderVariants(id, multiple.data)
  assert.equal(multiple.reads(), one.reads(), '6統計量のために同じ順位帯統計を6回集計しない')
  assert.equal(countedVariants.length, 6)
  const mutable = structuredClone(context)
  const variants = createBarChartProviderVariants(id, mutable)
  const captured = JSON.stringify(variants)
  mutable.data.rows[0].stats.defense = 999999
  mutable.data.counts.enemies.a.spawnCount = 999
  mutable.version.label = '変更後'
  assert.equal(JSON.stringify(variants), captured)
  assert.deepEqual(JSON.parse(captured), variants)
  assert.ok(Object.isFrozen(variants) && variants.every(item => Object.isFrozen(item) && Object.isFrozen(item.document.series[0].bins[0])))
})

test('標準化不能のnullと帯内が同値の0を全候補へそのまま受け渡し、空の候補も欠損を作り替えない', () => {
  const selectedRows = [enemy('a', 5, 10), enemy('b', 5, 30)]
  const variants = variantsFor({ data: { ...context.data, rows: selectedRows } })
  for (const { document } of variants) {
    assert.ok(document.series[0].bins.every(bin => bin.value === null))
    assert.ok(document.series[1].bins.every(bin => bin.value !== null))
  }
  for (const metric of ['width', 'standardDeviation', 'variance']) {
    assert.ok(variants.find(item => item.key === metric).document.series[1].bins.some(bin => bin.value === 0))
  }
  const empty = variantsFor({ data: { ...context.data, rows: [] } })
  assert.equal(empty.length, 6)
  assert.ok(empty.every(item => item.document.bins.length === 0 && item.document.series.every(series => series.population.valid === 0)))
})

test('全提供元が出力候補を持ち、不正な提供元・順位帯条件を拒否する', () => {
  assert.ok(BAR_CHART_PROVIDERS.every(provider => typeof provider.createVariants === 'function'))
  assert.throws(() => createBarChartProviderVariants('unknown', context))
  for (const rankBandMetric of ['unknown', '', 'toString']) assert.throws(() => variantsFor({ rankBandMetric }))
  for (const rankBandStep of [0, 7, 50, '10']) assert.throws(() => variantsFor({ rankBandStep }))
  for (const countMode of ['TYPES', 'MAPS']) assert.throws(() => variantsFor({ countMode }), /出現回数/)
  assert.throws(() => variantsFor({ scope: 'main', data: { ...context.data, mainStoryCounts: undefined } }), /出現回数/)
})

test('敵分布は現在の階級方式を維持し、数値7ステータス・評価対応4ステータスだけを返す', () => {
  for (const histogramBinning of ['numeric', 'rating']) for (const scope of ['all', 'main']) {
    const expectedMetrics = ENEMY_STAT_METRICS.filter(metric => histogramBinning === 'numeric' || isEnemyRatingStat(metric.key))
    const selected = { ...context, scope, histogramBinning, statKey: 'defense' }
    const variants = createBarChartProviderVariants('enemy-stat-histogram', selected)
    assert.deepEqual(variants.map(variant => variant.key), expectedMetrics.map(metric => metric.key))
    assert.deepEqual(variants.map(variant => variant.label), expectedMetrics.map(metric => metric.label))
    assert.ok(Object.isFrozen(variants) && variants.every(Object.isFrozen))
    const names = new Set()
    for (const [index, variant] of variants.entries()) {
      const metric = expectedMetrics[index]
      assert.deepEqual(variant.document, createBarChartFromProvider('enemy-stat-histogram', { ...selected, statKey: metric.key }))
      assert.equal(variant.document.source.aggregationScope, scope)
      assert.equal(variant.document.semantics.metricKey, metric.key)
      assert.equal(variant.document.source.countMode, 'SPAWNS')
      assert.equal(variant.document.semantics.xQualifier === 'ゲーム内評価', histogramBinning === 'rating')
      names.add(getBarChartFilename(variant.document, settings, 16 / 9))
    }
    assert.equal(names.size, expectedMetrics.length)
  }
  for (const histogramBinning of ['', 'unknown']) {
    assert.throws(() => createBarChartProviderVariants('enemy-stat-histogram', { ...context, histogramBinning }))
  }
})

test('評価別比較は同一指標を含めて左右の順序が異なる16組を保持する', () => {
  const eligible = ENEMY_STAT_METRICS.filter(metric => isEnemyRatingStat(metric.key))
  const expected = eligible.flatMap(left => eligible.map(right => ({ left, right })))
  for (const scope of ['all', 'main']) {
    const selected = { ...context, scope, leftStatKey: 'defense', rightStatKey: 'magicResistance' }
    const variants = createBarChartProviderVariants('enemy-stat-rating-comparison', selected)
    assert.equal(variants.length, 16)
    const names = new Set()
    for (const [index, variant] of variants.entries()) {
      const { left, right } = expected[index]
      assert.equal(variant.key, `${left.key}-${right.key}`)
      assert.equal(variant.label, `左${left.label} ／ 右${right.label}`)
      assert.deepEqual(variant.document, createBarChartFromProvider('enemy-stat-rating-comparison', {
        ...selected, leftStatKey: left.key, rightStatKey: right.key,
      }))
      assert.deepEqual(variant.document.series.map(series => series.metricKey), [left.key, right.key])
      assert.equal(variant.document.source.aggregationScope, scope)
      names.add(getBarChartFilename(variant.document, { ...settings, comparisonBand: 'rank' }, 16 / 9))
    }
    assert.equal(names.size, 16)
  }
})

test('防御力と術耐性の対応は収録された範囲だけを選び、未収録の本編出現回数へ代替しない', () => {
  const variants = createBarChartProviderVariants('enemy-defense-resistance', context)
  assert.deepEqual(variants.map(variant => variant.key), ['all', 'main'])
  assert.deepEqual(variants.map(variant => variant.label), ['全体', 'メインストーリー'])
  const names = new Set()
  for (const variant of variants) {
    assert.deepEqual(variant.document, createBarChartFromProvider('enemy-defense-resistance', { ...context, scope: variant.key }))
    assert.equal(variant.document.source.aggregationScope, variant.key)
    names.add(getBarChartFilename(variant.document, settings, 16 / 9))
  }
  assert.equal(names.size, 2)
  const archived = { ...context, version: { ...version, id: 'v1' }, data: { ...context.data, mainStoryCounts: undefined } }
  const available = createBarChartProviderVariants('enemy-defense-resistance', archived)
  assert.ok(available === undefined || available.length === 1)
  if (available) {
    assert.equal(available[0].key, 'all')
    assert.equal(available[0].document.source.aggregationScope, 'all')
    assert.deepEqual(available[0].document, createBarChartFromProvider('enemy-defense-resistance', archived))
  }
  assert.throws(() => createBarChartFromProvider('enemy-defense-resistance', { ...archived, scope: 'main' }), /出現回数/)
  for (const countMode of ['TYPES', 'MAPS']) {
    assert.throws(() => createBarChartProviderVariants('enemy-defense-resistance', { ...context, countMode }), /出現回数/)
  }
})

test('新しい候補も元の集計や選択状態を後から変更しても変化しない', () => {
  for (const source of ['enemy-stat-histogram', 'enemy-stat-rating-comparison', 'enemy-defense-resistance']) {
    const mutable = structuredClone(context)
    const variants = createBarChartProviderVariants(source, mutable)
    const captured = JSON.stringify(variants)
    mutable.data.rows[0].stats.defense = 999999
    mutable.data.counts.enemies.a.spawnCount = 999
    mutable.scope = 'main'
    mutable.version.label = '変更後'
    assert.equal(JSON.stringify(variants), captured)
    assert.ok(Object.isFrozen(variants) && variants.every(variant => Object.isFrozen(variant.document)))
  }
})

test('v12の全体・メインストーリーで全提供元の候補を既存の単体出力に一致させる', async () => {
  const folder = new URL('../public/data/enemy-aggregation/', import.meta.url)
  const client = createEnemyAggregationClient({ fetch: async input =>
    new Response(await readFile(new URL(String(input).split('/').at(-1), folder))) })
  const { versions } = await client.loadIndex()
  const version = versions.find(item => item.id === 'v12')
  const data = await client.loadVersion(version)
  for (const scope of ['all', 'main']) {
    const rankBandStep = 20
    const variants = createBarChartProviderVariants(id, { data, version, scope, rankBandStep })
    const scoped = scope === 'main' ? getEnemyMainStoryScope(data) : data
    const expected = buildStandardizedEnemyRankBandStatistics(scoped.rows, scoped.counts, rankBandStep)
    for (const variant of variants) {
      assert.deepEqual(variant.document, createBarChartFromProvider(id, { data, version, scope, rankBandStep, rankBandMetric: variant.key }))
      assert.equal(variant.document.source.aggregationScope, scope)
      assert.equal(variant.document.series[0].population.valid, expected.total)
    }
    for (const histogramBinning of ['numeric', 'rating']) {
      const source = 'enemy-stat-histogram'
      const selected = { data, version, scope, histogramBinning }
      const histogramVariants = createBarChartProviderVariants(source, selected)
      assert.equal(histogramVariants.length, histogramBinning === 'numeric' ? 7 : 4)
      for (const variant of histogramVariants) {
        assert.deepEqual(variant.document, createBarChartFromProvider(source, { ...selected, statKey: variant.key }))
        assert.equal(variant.document.source.aggregationScope, scope)
      }
    }
    const comparisonVariants = createBarChartProviderVariants('enemy-stat-rating-comparison', { data, version, scope })
    assert.equal(comparisonVariants.length, 16)
    for (const variant of comparisonVariants) {
      const [leftStatKey, rightStatKey] = variant.key.split('-')
      assert.deepEqual(variant.document, createBarChartFromProvider('enemy-stat-rating-comparison', {
        data, version, scope, leftStatKey, rightStatKey,
      }))
      assert.equal(variant.document.source.aggregationScope, scope)
    }
  }
  const correspondenceVariants = createBarChartProviderVariants('enemy-defense-resistance', { data, version, scope: 'main' })
  assert.deepEqual(correspondenceVariants.map(variant => variant.key), ['all', 'main'])
  for (const variant of correspondenceVariants) {
    assert.deepEqual(variant.document, createBarChartFromProvider('enemy-defense-resistance', { data, version, scope: variant.key }))
  }
})

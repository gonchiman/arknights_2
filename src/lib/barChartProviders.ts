import { createBarChartDocument, type BarChartBin, type BarChartDocument, type BarChartSeries, type BarChartSource } from './barChartDocument.ts'
import { getEnemyMainStoryScope, type EnemyAggregationData } from './enemyAggregationData.ts'
import type { EnemyAggregationVersion } from './enemyAggregationContract.ts'
import { buildEnemyDefenseResistanceBands } from './enemyDefenseResistance.ts'
import {
  buildEnemyHistogramObservations, ENEMY_HISTOGRAM_COUNT_MODES, getEnemySpawnCoverageLabel,
  type EnemyHistogramCountMode,
} from './enemyHistogramCounts.ts'
import { calculateWeightedHistogram } from './enemyWeightedHistogram.ts'
import { formatHistogramBinRangeLines } from './histogramBinRangeLabels.ts'
import { buildHistogramCumulativeRows } from './histogramCumulative.ts'
import { ENEMY_STAT_METRICS, type EnemyStatKey } from './enemyStatMetrics.ts'
import { buildEnemyRatingHistogramBins, isEnemyRatingStat } from './enemyRatingHistogram.ts'
import { getHistogramStatRankBands } from './histogramStatRankBands.ts'
import { formatHistogramRatingRangeLines } from './histogramRatingRangeStrip.ts'
import type { EnemyRatingStat } from './enemyStatRatings.ts'
import { buildStandardizedEnemyRankBandStatistics, type EnemyRankBandStatValues } from './enemyRankBandStatistics.ts'
import { ENEMY_RANK_BAND_STATISTIC_LABELS } from './enemyRankBandStatisticsDisplay.ts'

export type BarChartProviderId = 'enemy-stat-histogram' | 'enemy-defense-resistance' | 'enemy-stat-rating-comparison'
  | 'enemy-rank-band-statistics'

export interface BarChartProviderContext {
  readonly data: EnemyAggregationData
  readonly version: Pick<EnemyAggregationVersion, 'id' | 'label' | 'sourceRevision' | 'ruleVersion'>
  readonly scope: 'all' | 'main'
  readonly countMode?: EnemyHistogramCountMode
  readonly statKey?: EnemyStatKey
  readonly histogramBinning?: 'numeric' | 'rating'
  readonly leftStatKey?: EnemyRatingStat
  readonly rightStatKey?: EnemyRatingStat
  readonly rankBandStep?: 5 | 10 | 20
  readonly rankBandMetric?: keyof EnemyRankBandStatValues
}

export interface BarChartProvider {
  readonly id: BarChartProviderId
  readonly label: string
  readonly variantLabel?: string
  readonly createDocument: (context: BarChartProviderContext) => BarChartDocument
  readonly createVariants?: (context: BarChartProviderContext) => readonly BarChartProviderVariant[]
}

/** Fixed alternative documents supplied by a source, without page or export state. */
export interface BarChartProviderVariant {
  readonly key: string
  readonly label: string
  readonly document: BarChartDocument
}

function scopeData(context: BarChartProviderContext, countMode: EnemyHistogramCountMode) {
  if (context.scope !== 'main') return context.data
  const scoped = getEnemyMainStoryScope(context.data)
  if (countMode === 'SPAWNS' && !scoped.spawnCountsAvailable) {
    throw new Error('この集計版ではメインストーリーの出現回数を利用できません。')
  }
  return scoped
}

function sourceMetadata(context: BarChartProviderContext, providerId: BarChartProviderId,
  countMode: EnemyHistogramCountMode, counts: EnemyAggregationData['counts'], population: BarChartSource['population'],
  parameters: BarChartSource['parameters']): BarChartSource {
  const mode = ENEMY_HISTOGRAM_COUNT_MODES.find(item => item.key === countMode)!
  return {
    providerId, aggregationVersion: { id: context.version.id, label: context.version.label,
      sourceRevision: context.version.sourceRevision, ruleVersion: context.version.ruleVersion },
    aggregationScope: context.scope, scopeLabel: context.scope === 'main' ? 'メインストーリー' : '全体',
    countMode, countLabel: mode.label, countUnit: mode.unit, population,
    coverage: { ...counts.summary },
    coverageLabel: countMode === 'SPAWNS' ? getEnemySpawnCoverageLabel(counts.summary)
      : countMode === 'MAPS' ? `収録 ${counts.summary.mapCount.toLocaleString('ja-JP')}マップ` : '',
    parameters,
  }
}

const number = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 12 })
const fractionDigits = (values: readonly number[]) => values.some(value => !Number.isInteger(value)) ? 12 : 0
const filenameParts = (source: BarChartSource) => [
  `集計${source.aggregationVersion.id}`, source.scopeLabel, '全敵', source.countLabel,
  ...source.parameters.map(({ label, value }) => `${label}${value}`),
]

function histogramInput(context: BarChartProviderContext) {
  const statKey = context.statKey ?? 'magicResistance'
  const metric = ENEMY_STAT_METRICS.find(item => item.key === statKey)
  if (!metric) throw new Error('ステータスを確認できませんでした。')
  const binning = context.histogramBinning ?? 'numeric'
  if (binning !== 'numeric' && binning !== 'rating') throw new Error('階級の区切りを確認できませんでした。')
  if (binning === 'rating' && !isEnemyRatingStat(statKey)) {
    throw new Error('このステータスはゲーム内評価に対応していません。')
  }
  return { statKey, metric, binning }
}

function createEnemyStatHistogram(context: BarChartProviderContext): BarChartDocument {
  const { statKey, metric, binning } = histogramInput(context)
  const countMode = context.countMode ?? 'SPAWNS'
  const scoped = scopeData(context, countMode)
  const observations = buildEnemyHistogramObservations(scoped.rows, enemy => enemy.stats[statKey], countMode, scoped.counts)
  const statistics = calculateWeightedHistogram(observations, {
    scale: metric.defaultScale, minimumLinearBinWidth: metric.minimumLinearBinWidth,
    // Preserve the workbench's existing resistance classes; other stats reuse automatic classes.
    ...(statKey === 'magicResistance' ? { customLinearBinWidth: 10, minimumLinearUpperBound: 100 } : {}),
  })
  if (binning === 'rating' && isEnemyRatingStat(statKey)) {
    const ratingBins = buildEnemyRatingHistogramBins(observations, statKey)
    const bins = buildHistogramCumulativeRows(ratingBins, statistics.count)
      .map(({ bin, proportion, cumulativeProportion }): BarChartBin => ({
        id: `rating-${bin.rating}`, label: bin.rating, value: bin.count,
        interval: { start: bin.lowerBound, end: bin.upperBound,
          includesMinimum: bin.lowerInclusive, includesMaximum: bin.upperInclusive,
          isOverflow: bin.upperBound === null },
        share: proportion, cumulativeShare: cumulativeProportion,
      }))
    const source = sourceMetadata(context, 'enemy-stat-histogram', countMode, scoped.counts,
      { total: statistics.totalCount, valid: statistics.count, missing: statistics.missingCount, basis: 'single-stat' },
      [{ label: '階級', value: 'ゲーム内評価' }])
    return createBarChartDocument({
      xKind: 'interval', bins, fractionDigits: fractionDigits(ratingBins.map(bin => bin.count)),
      secondaryAxisBand: { title: '範囲', labels: ratingBins.map(formatHistogramRatingRangeLines) },
      semantics: { kind: 'histogram', subject: metric.label, metricKey: statKey, xLabel: metric.label, xUnit: metric.suffix || undefined,
        xQualifier: 'ゲーム内評価', xBandTitle: '評価',
        yLabel: ENEMY_HISTOGRAM_COUNT_MODES.find(item => item.key === countMode)!.axisLabel, yUnit: source.countUnit },
      source, filenameParts: filenameParts(source), capabilities: { percentages: true, cumulative: true, rankBands: false },
    })
  }
  const bins = buildHistogramCumulativeRows(statistics.bins, statistics.count).map(({ bin, proportion, cumulativeProportion }, index): BarChartBin => ({
    id: `interval-${index}-${bin.start}-${bin.end}`,
    label: formatHistogramBinRangeLines(bin).join(''), value: bin.count,
    interval: { start: bin.start, end: bin.isOverflow ? null : bin.end,
      includesMinimum: !bin.isOverflow, includesMaximum: !bin.isOverflow && bin.includesMaximum,
      isOverflow: Boolean(bin.isOverflow) },
    share: proportion, cumulativeShare: cumulativeProportion,
  }))
  const binWidth = statistics.histogram?.binWidth
  const parameters = [
    { label: '階級幅', value: statKey === 'magicResistance' ? '10' : binWidth == null ? '自動' : `自動 ${number(binWidth)}` },
    { label: '上限', value: statistics.histogram ? `自動 ${number(statistics.histogram.normalRangeEnd)}` : '自動' },
  ]
  const source = sourceMetadata(context, 'enemy-stat-histogram', countMode, scoped.counts,
    { total: statistics.totalCount, valid: statistics.count, missing: statistics.missingCount, basis: 'single-stat' }, parameters)
  const rankBands = isEnemyRatingStat(statKey)
    ? getHistogramStatRankBands(statKey, statistics.bins, metric.defaultScale) : undefined
  return createBarChartDocument({
    xKind: 'interval', bins, fractionDigits: fractionDigits(statistics.bins.map(bin => bin.count)),
    ...(rankBands !== undefined ? { rankBands } : {}),
    semantics: { kind: 'histogram', subject: metric.label, metricKey: statKey, xLabel: metric.label, xUnit: metric.suffix || undefined,
      yLabel: ENEMY_HISTOGRAM_COUNT_MODES.find(item => item.key === countMode)!.axisLabel, yUnit: source.countUnit },
    source, filenameParts: filenameParts(source), capabilities: { percentages: true, cumulative: true, rankBands: rankBands !== undefined },
  })
}

function createEnemyStatHistogramVariants(context: BarChartProviderContext): readonly BarChartProviderVariant[] {
  const { binning } = histogramInput(context)
  return Object.freeze(ENEMY_STAT_METRICS.filter(metric => binning !== 'rating' || isEnemyRatingStat(metric.key))
    .map(metric => Object.freeze({ key: metric.key, label: metric.label,
      document: createEnemyStatHistogram({ ...context, statKey: metric.key }) })))
}

function createDefenseResistance(context: BarChartProviderContext): BarChartDocument {
  if (context.countMode !== undefined && context.countMode !== 'SPAWNS') {
    throw new Error('防御力と術耐性の対応は出現回数で集計します。')
  }
  const scoped = scopeData(context, 'SPAWNS')
  const result = buildEnemyDefenseResistanceBands(scoped.rows, scoped.counts)
  const allObservations = buildEnemyHistogramObservations(scoped.rows, enemy => enemy.stats.magicResistance, 'SPAWNS', scoped.counts)
  const total = allObservations.reduce((sum, { weight }) => sum + (Number.isFinite(weight) && weight > 0 ? weight : 0), 0)
  const source = sourceMetadata(context, 'enemy-defense-resistance', 'SPAWNS', scoped.counts,
    { total, valid: result.total, missing: Math.max(0, total - result.total), basis: 'paired-stats' },
    [{ label: '術耐性', value: '10刻み' }])
  return createBarChartDocument({
    xKind: 'point',
    bins: result.resistanceThresholds.map(row => ({
      id: `resistance-${row.resistance}`, label: number(row.resistance), point: row.resistance,
      value: row.defense, rankPercentage: row.percentage, rankCutoff: row.rankCutoff,
    })),
    fractionDigits: fractionDigits(result.resistanceThresholds.flatMap(row => row.defense === null ? [] : [row.defense])),
    semantics: { kind: 'correspondence', subject: '防御力と術耐性', metricKey: 'defense', xLabel: '術耐性', yLabel: '防御力' },
    source, filenameParts: filenameParts(source), capabilities: { percentages: false, cumulative: false, rankBands: false },
  })
}

function createDefenseResistanceVariants(context: BarChartProviderContext): readonly BarChartProviderVariant[] {
  if (context.countMode !== undefined && context.countMode !== 'SPAWNS') {
    throw new Error('防御力と術耐性の対応は出現回数で集計します。')
  }
  const scopes: BarChartProviderContext['scope'][] = context.data.mainStoryCounts ? ['all', 'main'] : ['all']
  return Object.freeze(scopes.map(scope => {
    const document = createDefenseResistance({ ...context, scope })
    return Object.freeze({ key: scope, label: document.source.scopeLabel, document })
  }))
}

/** Rating aggregation remains the same operation used by the single-series provider. */
function ratingComparisonKeys(context: BarChartProviderContext) {
  const leftKey = context.leftStatKey ?? 'defense'
  const rightKey = context.rightStatKey ?? 'magicResistance'
  if (!isEnemyRatingStat(leftKey) || !isEnemyRatingStat(rightKey)) {
    throw new Error('このステータスはゲーム内評価に対応していません。')
  }
  return { leftKey, rightKey }
}

function createEnemyStatRatingComparison(context: BarChartProviderContext): BarChartDocument {
  const { leftKey, rightKey } = ratingComparisonKeys(context)
  const documents = [leftKey, rightKey].map(statKey => createEnemyStatHistogram({
    ...context, statKey, histogramBinning: 'rating',
  }))
  const [left, right] = documents
  return ratingComparisonDocument(left, right, leftKey, rightKey)
}

function ratingComparisonDocument(left: BarChartDocument, right: BarChartDocument,
  leftKey: EnemyRatingStat, rightKey: EnemyRatingStat): BarChartDocument {
  const makeSeries = (document: BarChartDocument, id: 'left' | 'right', metricKey: EnemyRatingStat): BarChartSeries => ({
    id, label: document.semantics.subject, metricKey, bins: document.bins, population: document.source.population!,
  })
  const series: [BarChartSeries, BarChartSeries] = [makeSeries(left, 'left', leftKey), makeSeries(right, 'right', rightKey)]
  const source: BarChartSource = { ...left.source, providerId: 'enemy-stat-rating-comparison', population: null, parameters: [] }
  return createBarChartDocument({
    layout: 'mirrored', xKind: 'category',
    bins: left.bins.map(bin => ({ id: bin.id, label: bin.label, value: null })), series,
    fractionDigits: Math.max(left.fractionDigits, right.fractionDigits),
    semantics: { kind: 'comparison', itemKind: 'interval', subject: leftKey === rightKey ? left.semantics.subject
      : `${left.semantics.subject}・${right.semantics.subject}`, xLabel: '評価別割合', xUnit: '%', yLabel: '評価' },
    source, capabilities: { percentages: true, cumulative: true, rankBands: false },
    filenameParts: [`左${left.semantics.subject}`, `右${right.semantics.subject}`, ...filenameParts(source), '左右の横棒'],
  })
}

/** Reuse each metric's exact rating histogram across all ordered left/right combinations. */
function createEnemyStatRatingComparisonVariants(context: BarChartProviderContext): readonly BarChartProviderVariant[] {
  ratingComparisonKeys(context)
  const keys = ENEMY_STAT_METRICS.map(metric => metric.key).filter(isEnemyRatingStat)
  const documents = new Map(keys.map(statKey => [statKey,
    createEnemyStatHistogram({ ...context, statKey, histogramBinning: 'rating' })]))
  return Object.freeze(keys.flatMap(leftKey => keys.map(rightKey => {
    const left = documents.get(leftKey)!, right = documents.get(rightKey)!
    return Object.freeze({ key: `${leftKey}-${rightKey}`, label: `左${left.semantics.subject} ／ 右${right.semantics.subject}`,
      document: ratingComparisonDocument(left, right, leftKey, rightKey) })
  })))
}

function rankBandMetric(context: BarChartProviderContext): keyof EnemyRankBandStatValues {
  const metric = context.rankBandMetric ?? 'standardDeviation'
  if (!Object.hasOwn(ENEMY_RANK_BAND_STATISTIC_LABELS, metric)) throw new Error('順位帯の統計量を確認できませんでした。')
  return metric
}

/** Reuse one table calculation when several statistics share the same source conditions. */
function prepareEnemyRankBandStatistics(context: BarChartProviderContext) {
  if (context.countMode !== undefined && context.countMode !== 'SPAWNS') {
    throw new Error('順位帯の統計は出現回数で集計します。')
  }
  const scoped = scopeData(context, 'SPAWNS')
  const step = context.rankBandStep ?? 10
  const result = buildStandardizedEnemyRankBandStatistics(scoped.rows, scoped.counts, step)
  const observations = buildEnemyHistogramObservations(scoped.rows, enemy => enemy.stats.defense, 'SPAWNS', scoped.counts)
  const total = observations.reduce((sum, { weight }) => sum + (Number.isFinite(weight) && weight > 0 ? weight : 0), 0)
  const population = { total, valid: result.total, missing: Math.max(0, total - result.total), basis: 'paired-stats' as const }
  return { scoped, step, result, population }
}

function rankBandStatisticsDocument(context: BarChartProviderContext, metric: keyof EnemyRankBandStatValues,
  { scoped, step, result, population }: ReturnType<typeof prepareEnemyRankBandStatistics>): BarChartDocument {
  const label = ENEMY_RANK_BAND_STATISTIC_LABELS[metric]
  const categoryId = (band: { from: number; to: number }) => `rank-band-${band.from}-${band.to}`
  const categoryLabel = (band: { from: number; to: number }) => `上位${band.from}〜${band.to}%`
  const makeSeries = (id: 'left' | 'right', key: 'defense' | 'resistance', metricKey: string, label: string): BarChartSeries => ({
    id, metricKey, label, population,
    bins: result.bands.map(band => ({ id: categoryId(band), label: categoryLabel(band),
      value: band[key]?.[metric] ?? null })),
  })
  const source = sourceMetadata(context, 'enemy-rank-band-statistics', 'SPAWNS', scoped.counts, null, [
    { label: '標準化', value: '全体基準' },
    ...(['variance', 'standardDeviation'].includes(metric) ? [{ label: '分散', value: '母分散' }] : []),
    { label: '順位帯', value: `${step}ポイント` },
    { label: '対象', value: '防御力・術耐性の両方が有効' },
  ])
  return createBarChartDocument({
    layout: 'mirrored', xKind: 'category', fractionDigits: 2,
    bins: result.bands.map(band => ({ id: categoryId(band), label: categoryLabel(band), value: null })),
    series: [makeSeries('left', 'defense', 'defense', '防御力'), makeSeries('right', 'resistance', 'magicResistance', '術耐性')],
    semantics: { kind: 'comparison', comparisonValue: 'value', comparisonLabel: `順位帯別${label}`, itemKind: 'interval',
      subject: '防御力・術耐性', xLabel: label, xQualifier: '標準化', yLabel: 'ステータス順位帯' },
    source, capabilities: { percentages: false, cumulative: false, rankBands: false },
    filenameParts: [`集計${source.aggregationVersion.id}`, source.scopeLabel, source.countLabel,
      '標準化(全体基準)', ...(['variance', 'standardDeviation'].includes(metric) ? ['母分散'] : []),
      `順位帯${step}ポイント`, '左右の横棒'],
  })
}

/** Consume the existing whole-distribution standardization and tied-rank weighting. */
function createEnemyRankBandStatistics(context: BarChartProviderContext): BarChartDocument {
  const metric = rankBandMetric(context)
  return rankBandStatisticsDocument(context, metric, prepareEnemyRankBandStatistics(context))
}

function createEnemyRankBandStatisticsVariants(context: BarChartProviderContext): readonly BarChartProviderVariant[] {
  rankBandMetric(context)
  const prepared = prepareEnemyRankBandStatistics(context)
  return Object.freeze((Object.keys(ENEMY_RANK_BAND_STATISTIC_LABELS) as (keyof EnemyRankBandStatValues)[])
    .map(key => Object.freeze({ key, label: ENEMY_RANK_BAND_STATISTIC_LABELS[key],
      document: rankBandStatisticsDocument(context, key, prepared) })))
}

/** Providers consume their own calculated snapshot; they never inspect another page's state. */
export const BAR_CHART_PROVIDERS: readonly BarChartProvider[] = Object.freeze([
  Object.freeze({ id: 'enemy-stat-histogram', label: '敵のステータス分布', variantLabel: 'ステータス',
    createDocument: createEnemyStatHistogram, createVariants: createEnemyStatHistogramVariants }),
  Object.freeze({ id: 'enemy-defense-resistance', label: '防御力と術耐性の対応', variantLabel: '集計範囲',
    createDocument: createDefenseResistance, createVariants: createDefenseResistanceVariants }),
  Object.freeze({ id: 'enemy-stat-rating-comparison', label: '敵ステータスの評価別比較', variantLabel: '組み合わせ',
    createDocument: createEnemyStatRatingComparison, createVariants: createEnemyStatRatingComparisonVariants }),
  Object.freeze({ id: 'enemy-rank-band-statistics', label: '防御力・術耐性の順位帯統計', variantLabel: '統計量', createDocument: createEnemyRankBandStatistics,
    createVariants: createEnemyRankBandStatisticsVariants }),
])

export function createBarChartFromProvider(id: BarChartProviderId, context: BarChartProviderContext): BarChartDocument {
  const provider = BAR_CHART_PROVIDERS.find(item => item.id === id)
  if (!provider) throw new Error('棒グラフのデータ取得元を確認できませんでした。')
  return provider.createDocument(context)
}

/** An absent capability keeps unsupported sources on their existing single-image workflow. */
export function createBarChartProviderVariants(id: BarChartProviderId,
  context: BarChartProviderContext): readonly BarChartProviderVariant[] | undefined {
  const provider = BAR_CHART_PROVIDERS.find(item => item.id === id)
  if (!provider) throw new Error('棒グラフのデータ取得元を確認できませんでした。')
  return provider.createVariants?.(context)
}

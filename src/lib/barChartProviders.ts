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

export type BarChartProviderId = 'enemy-stat-histogram' | 'enemy-defense-resistance' | 'enemy-stat-rating-comparison'

export interface BarChartProviderContext {
  readonly data: EnemyAggregationData
  readonly version: Pick<EnemyAggregationVersion, 'id' | 'label' | 'sourceRevision' | 'ruleVersion'>
  readonly scope: 'all' | 'main'
  readonly countMode?: EnemyHistogramCountMode
  readonly statKey?: EnemyStatKey
  readonly histogramBinning?: 'numeric' | 'rating'
  readonly leftStatKey?: EnemyRatingStat
  readonly rightStatKey?: EnemyRatingStat
}

export interface BarChartProvider {
  readonly id: BarChartProviderId
  readonly label: string
  readonly createDocument: (context: BarChartProviderContext) => BarChartDocument
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

function createEnemyStatHistogram(context: BarChartProviderContext): BarChartDocument {
  const statKey = context.statKey ?? 'magicResistance'
  const metric = ENEMY_STAT_METRICS.find(item => item.key === statKey)
  if (!metric) throw new Error('ステータスを確認できませんでした。')
  const binning = context.histogramBinning ?? 'numeric'
  if (binning !== 'numeric' && binning !== 'rating') throw new Error('階級の区切りを確認できませんでした。')
  if (binning === 'rating' && !isEnemyRatingStat(statKey)) {
    throw new Error('このステータスはゲーム内評価に対応していません。')
  }
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

/** Rating aggregation remains the same operation used by the single-series provider. */
function createEnemyStatRatingComparison(context: BarChartProviderContext): BarChartDocument {
  const leftKey = context.leftStatKey ?? 'defense'
  const rightKey = context.rightStatKey ?? 'magicResistance'
  if (!isEnemyRatingStat(leftKey) || !isEnemyRatingStat(rightKey)) {
    throw new Error('このステータスはゲーム内評価に対応していません。')
  }
  const documents = [leftKey, rightKey].map(statKey => createEnemyStatHistogram({
    ...context, statKey, histogramBinning: 'rating',
  }))
  const [left, right] = documents
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

/** Providers consume their own calculated snapshot; they never inspect another page's state. */
export const BAR_CHART_PROVIDERS: readonly BarChartProvider[] = Object.freeze([
  Object.freeze({ id: 'enemy-stat-histogram', label: '敵のステータス分布', createDocument: createEnemyStatHistogram }),
  Object.freeze({ id: 'enemy-defense-resistance', label: '防御力と術耐性の対応', createDocument: createDefenseResistance }),
  Object.freeze({ id: 'enemy-stat-rating-comparison', label: '敵ステータスの評価別比較', createDocument: createEnemyStatRatingComparison }),
])

export function createBarChartFromProvider(id: BarChartProviderId, context: BarChartProviderContext): BarChartDocument {
  const provider = BAR_CHART_PROVIDERS.find(item => item.id === id)
  if (!provider) throw new Error('棒グラフのデータ取得元を確認できませんでした。')
  return provider.createDocument(context)
}

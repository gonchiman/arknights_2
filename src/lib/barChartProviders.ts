import { createBarChartDocument, type BarChartBin, type BarChartDocument, type BarChartSource } from './barChartDocument.ts'
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

export type BarChartProviderId = 'enemy-resistance-histogram' | 'enemy-defense-resistance'

export interface BarChartProviderContext {
  readonly data: EnemyAggregationData
  readonly version: Pick<EnemyAggregationVersion, 'id' | 'label' | 'sourceRevision' | 'ruleVersion'>
  readonly scope: 'all' | 'main'
  readonly countMode?: EnemyHistogramCountMode
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

function createResistanceHistogram(context: BarChartProviderContext): BarChartDocument {
  const countMode = context.countMode ?? 'SPAWNS'
  const scoped = scopeData(context, countMode)
  const observations = buildEnemyHistogramObservations(scoped.rows, enemy => enemy.stats.magicResistance, countMode, scoped.counts)
  const statistics = calculateWeightedHistogram(observations, {
    scale: 'LINEAR', minimumLinearBinWidth: 1, customLinearBinWidth: 10, minimumLinearUpperBound: 100,
  })
  const bins = buildHistogramCumulativeRows(statistics.bins, statistics.count).map(({ bin, proportion, cumulativeProportion }, index): BarChartBin => ({
    id: `interval-${index}-${bin.start}-${bin.end}`,
    label: formatHistogramBinRangeLines(bin).join(''), value: bin.count,
    interval: { start: bin.start, end: bin.isOverflow ? null : bin.end,
      includesMinimum: !bin.isOverflow, includesMaximum: !bin.isOverflow && bin.includesMaximum,
      isOverflow: Boolean(bin.isOverflow) },
    share: proportion, cumulativeShare: cumulativeProportion,
  }))
  const parameters = [{ label: '階級幅', value: '10' }, { label: '上限', value: statistics.histogram ? `自動 ${number(statistics.histogram.normalRangeEnd)}` : '自動' }]
  const source = sourceMetadata(context, 'enemy-resistance-histogram', countMode, scoped.counts,
    { total: statistics.totalCount, valid: statistics.count, missing: statistics.missingCount, basis: 'single-stat' }, parameters)
  return createBarChartDocument({
    xKind: 'interval', bins, fractionDigits: fractionDigits(statistics.bins.map(bin => bin.count)),
    semantics: { kind: 'histogram', subject: '術耐性', xLabel: '術耐性',
      yLabel: ENEMY_HISTOGRAM_COUNT_MODES.find(item => item.key === countMode)!.axisLabel, yUnit: source.countUnit },
    source, filenameParts: filenameParts(source), capabilities: { percentages: true, cumulative: true },
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
    semantics: { kind: 'correspondence', subject: '防御力と術耐性', xLabel: '術耐性', yLabel: '防御力' },
    source, filenameParts: filenameParts(source), capabilities: { percentages: false, cumulative: false },
  })
}

/** Providers consume their own calculated snapshot; they never inspect another page's state. */
export const BAR_CHART_PROVIDERS: readonly BarChartProvider[] = Object.freeze([
  Object.freeze({ id: 'enemy-resistance-histogram', label: '敵の術耐性分布', createDocument: createResistanceHistogram }),
  Object.freeze({ id: 'enemy-defense-resistance', label: '防御力と術耐性の対応', createDocument: createDefenseResistance }),
])

export function createBarChartFromProvider(id: BarChartProviderId, context: BarChartProviderContext): BarChartDocument {
  const provider = BAR_CHART_PROVIDERS.find(item => item.id === id)
  if (!provider) throw new Error('棒グラフのデータ取得元を確認できませんでした。')
  return provider.createDocument(context)
}

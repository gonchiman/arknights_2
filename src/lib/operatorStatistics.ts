import {
  calculateNumericStatistics,
  type HistogramScale,
  type NumericStatistics,
} from './enemyStatistics.ts'
import { PROFESSION_ORDER } from './operatorFilters.ts'
import type {
  OperatorDatabaseRecord,
  OperatorDatabaseStats,
} from './operatorDatabase.ts'

export type OperatorAnalyzedStatKey = keyof Pick<
  OperatorDatabaseStats,
  | 'maxHp'
  | 'attack'
  | 'defense'
  | 'magicResistance'
  | 'deploymentCost'
  | 'blockCount'
  | 'redeployTime'
  | 'attackSpeed'
  | 'attackInterval'
>

export interface OperatorStatMetric {
  key: OperatorAnalyzedStatKey
  label: string
  axisLabel: string
  suffix: string
  valueDigits: number
  summaryDigits: number
  logBinCount: number
  minimumLinearBinWidth: number
  defaultScale: HistogramScale
}

export interface OperatorMetricObservation {
  operator: OperatorDatabaseRecord
  value: number
}

export interface OperatorScatterObservation {
  operator: OperatorDatabaseRecord
  x: number
  y: number
}

export interface OperatorProfessionObservationGroup {
  key: string
  label: string
  observations: OperatorMetricObservation[]
}

export interface OperatorMetricStatistics extends NumericStatistics {
  coefficientOfVariation: number | null
  interquartileRange: number | null
  normalizedInterquartileRange: number | null
}

export const OPERATOR_STAT_METRICS: readonly OperatorStatMetric[] = [
  {
    key: 'maxHp',
    label: 'HP',
    axisLabel: 'HP',
    suffix: '',
    valueDigits: 0,
    summaryDigits: 1,
    logBinCount: 12,
    minimumLinearBinWidth: 1,
    defaultScale: 'LOG',
  },
  {
    key: 'attack',
    label: '攻撃力',
    axisLabel: '攻撃力',
    suffix: '',
    valueDigits: 0,
    summaryDigits: 1,
    logBinCount: 12,
    minimumLinearBinWidth: 1,
    defaultScale: 'LOG',
  },
  {
    key: 'defense',
    label: '防御力',
    axisLabel: '防御力',
    suffix: '',
    valueDigits: 0,
    summaryDigits: 1,
    logBinCount: 12,
    minimumLinearBinWidth: 1,
    defaultScale: 'LOG',
  },
  {
    key: 'magicResistance',
    label: '術耐性',
    axisLabel: '術耐性',
    suffix: '',
    valueDigits: 0,
    summaryDigits: 1,
    logBinCount: 10,
    minimumLinearBinWidth: 1,
    defaultScale: 'LINEAR',
  },
  {
    key: 'deploymentCost',
    label: '配置コスト',
    axisLabel: '配置コスト',
    suffix: '',
    valueDigits: 0,
    summaryDigits: 2,
    logBinCount: 10,
    minimumLinearBinWidth: 1,
    defaultScale: 'LINEAR',
  },
  {
    key: 'blockCount',
    label: 'ブロック数',
    axisLabel: 'ブロック数',
    suffix: '',
    valueDigits: 0,
    summaryDigits: 2,
    logBinCount: 10,
    minimumLinearBinWidth: 1,
    defaultScale: 'LINEAR',
  },
  {
    key: 'redeployTime',
    label: '再配置時間',
    axisLabel: '再配置時間（秒）',
    suffix: '秒',
    valueDigits: 0,
    summaryDigits: 2,
    logBinCount: 10,
    minimumLinearBinWidth: 1,
    defaultScale: 'LINEAR',
  },
  {
    key: 'attackSpeed',
    label: '攻撃速度',
    axisLabel: '攻撃速度',
    suffix: '',
    valueDigits: 0,
    summaryDigits: 2,
    logBinCount: 10,
    minimumLinearBinWidth: 1,
    defaultScale: 'LINEAR',
  },
  {
    key: 'attackInterval',
    label: '攻撃間隔',
    axisLabel: '攻撃間隔（秒）',
    suffix: '秒',
    valueDigits: 2,
    summaryDigits: 2,
    logBinCount: 10,
    minimumLinearBinWidth: 0.01,
    defaultScale: 'LINEAR',
  },
]

export function getOperatorStatMetric(key: OperatorAnalyzedStatKey): OperatorStatMetric {
  return OPERATOR_STAT_METRICS.find((metric) => metric.key === key) ?? OPERATOR_STAT_METRICS[0]
}

export function getOperatorMetricValue(
  operator: OperatorDatabaseRecord,
  metricKey: OperatorAnalyzedStatKey,
): number | null {
  return operator.stats[metricKey]
}

/**
 * Missing values remain in the source so NumericStatistics.totalCount represents
 * the complete (already filtered) population rather than only valid observations.
 */
export function buildOperatorMetricSource(
  rows: ReadonlyArray<OperatorDatabaseRecord>,
  metricKey: OperatorAnalyzedStatKey,
): Array<number | null> {
  return rows.map((operator) => getOperatorMetricValue(operator, metricKey))
}

export function buildOperatorMetricObservations(
  rows: ReadonlyArray<OperatorDatabaseRecord>,
  metricKey: OperatorAnalyzedStatKey,
): OperatorMetricObservation[] {
  return rows.flatMap((operator) => {
    const value = getOperatorMetricValue(operator, metricKey)
    return typeof value === 'number' && Number.isFinite(value) ? [{ operator, value }] : []
  })
}

export function buildOperatorScatterObservations(
  rows: ReadonlyArray<OperatorDatabaseRecord>,
  xMetricKey: OperatorAnalyzedStatKey,
  yMetricKey: OperatorAnalyzedStatKey,
): OperatorScatterObservation[] {
  return rows.flatMap((operator) => {
    const x = getOperatorMetricValue(operator, xMetricKey)
    const y = getOperatorMetricValue(operator, yMetricKey)
    return typeof x === 'number' && Number.isFinite(x)
      && typeof y === 'number' && Number.isFinite(y)
      ? [{ operator, x, y }]
      : []
  })
}

export function calculateOperatorMetricStatistics(
  rows: ReadonlyArray<OperatorDatabaseRecord>,
  metricKey: OperatorAnalyzedStatKey,
  scale: HistogramScale = getOperatorStatMetric(metricKey).defaultScale,
  customLinearBinWidth: number | null = null,
): OperatorMetricStatistics {
  const metric = getOperatorStatMetric(metricKey)
  const statistics = calculateNumericStatistics(
    buildOperatorMetricSource(rows, metricKey),
    metric.logBinCount,
    scale,
    metric.minimumLinearBinWidth,
    customLinearBinWidth,
  )
  const interquartileRange = statistics.firstQuartile === null || statistics.thirdQuartile === null
    ? null
    : statistics.thirdQuartile - statistics.firstQuartile
  const supportsRelativeDispersion = statistics.minimum !== null && statistics.minimum >= 0

  return {
    ...statistics,
    coefficientOfVariation: supportsRelativeDispersion
      ? divideByPositiveFiniteValue(statistics.standardDeviation, statistics.mean)
      : null,
    interquartileRange,
    normalizedInterquartileRange: supportsRelativeDispersion
      ? divideByPositiveFiniteValue(interquartileRange, statistics.median)
      : null,
  }
}

function divideByPositiveFiniteValue(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (
    numerator === null
    || denominator === null
    || !Number.isFinite(numerator)
    || !Number.isFinite(denominator)
    || denominator <= 0
  ) {
    return null
  }

  const ratio = numerator / denominator
  return Number.isFinite(ratio) ? ratio : null
}

export function groupOperatorObservationsByProfession(
  observations: ReadonlyArray<OperatorMetricObservation>,
): OperatorProfessionObservationGroup[] {
  const groups = new Map<string, OperatorProfessionObservationGroup>()

  for (const observation of observations) {
    const key = observation.operator.profession
    const group = groups.get(key) ?? {
      key,
      label: observation.operator.professionLabel,
      observations: [],
    }
    group.observations.push(observation)
    groups.set(key, group)
  }

  const professionOrder = new Map<string, number>(
    PROFESSION_ORDER.map((profession, index) => [profession, index]),
  )

  return [...groups.values()].sort((a, b) => (
    (professionOrder.get(a.key) ?? PROFESSION_ORDER.length)
    - (professionOrder.get(b.key) ?? PROFESSION_ORDER.length)
    || a.label.localeCompare(b.label, 'ja')
  ))
}

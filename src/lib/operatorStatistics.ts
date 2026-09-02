import {
  calculateNumericStatisticsWithDispersion,
  type HistogramScale,
  type NumericStatisticsWithDispersion,
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

export type OperatorRadarScope = 'ALL' | 'PROFESSION' | 'SUB_PROFESSION'

export type OperatorRadarDirection = 'HIGHER_OUTWARD' | 'LOWER_OUTWARD'

export interface OperatorRadarMetric {
  key: OperatorAnalyzedStatKey
  label: string
  direction: OperatorRadarDirection
}

export interface OperatorRadarPoint extends OperatorRadarMetric {
  value: number | null
  score: number | null
  validCount: number
  suffix: string
  valueDigits: number
}

export interface OperatorRadarProfile {
  scope: OperatorRadarScope
  populationCount: number
  points: OperatorRadarPoint[]
}

export type OperatorMetricStatistics = NumericStatisticsWithDispersion

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

export const OPERATOR_RADAR_METRICS: readonly OperatorRadarMetric[] = [
  { key: 'maxHp', label: 'HP', direction: 'HIGHER_OUTWARD' },
  { key: 'attack', label: '攻撃力', direction: 'HIGHER_OUTWARD' },
  { key: 'defense', label: '防御力', direction: 'HIGHER_OUTWARD' },
  { key: 'magicResistance', label: '術耐性', direction: 'HIGHER_OUTWARD' },
  { key: 'deploymentCost', label: '配置コスト', direction: 'LOWER_OUTWARD' },
  { key: 'blockCount', label: 'ブロック数', direction: 'HIGHER_OUTWARD' },
  { key: 'redeployTime', label: '再配置時間', direction: 'LOWER_OUTWARD' },
  { key: 'attackInterval', label: '攻撃間隔', direction: 'LOWER_OUTWARD' },
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
  return calculateNumericStatisticsWithDispersion(
    buildOperatorMetricSource(rows, metricKey),
    metric.logBinCount,
    scale,
    metric.minimumLinearBinWidth,
    customLinearBinWidth,
  )
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

export function selectOperatorRadarPopulation(
  rows: ReadonlyArray<OperatorDatabaseRecord>,
  target: OperatorDatabaseRecord,
  scope: OperatorRadarScope,
): OperatorDatabaseRecord[] {
  if (scope === 'ALL') return [...rows]
  if (scope === 'PROFESSION') {
    return rows.filter((operator) => operator.profession === target.profession)
  }
  return rows.filter((operator) => (
    operator.profession === target.profession
    && operator.subProfessionId === target.subProfessionId
  ))
}

/**
 * Converts an observed value to a tie-aware midrank percentile on a 0–100 scale.
 * Each observation occupies the midpoint of its percentile band, which avoids
 * exaggerating a two-member population as absolute 0/100 endpoints.
 */
export function calculateOperatorRadarScore(
  value: number | null,
  source: ReadonlyArray<number | null>,
  direction: OperatorRadarDirection = 'HIGHER_OUTWARD',
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  const values = source.filter((candidate): candidate is number => (
    typeof candidate === 'number' && Number.isFinite(candidate)
  ))
  if (values.length === 0) return null

  const lessCount = values.filter((candidate) => candidate < value).length
  const equalCount = values.filter((candidate) => candidate === value).length
  if (equalCount === 0) return null

  const higherOutwardScore = (lessCount + equalCount / 2) / values.length * 100
  const score = direction === 'LOWER_OUTWARD'
    ? 100 - higherOutwardScore
    : higherOutwardScore

  return Math.min(100, Math.max(0, score))
}

export function buildOperatorRadarProfile(
  rows: ReadonlyArray<OperatorDatabaseRecord>,
  target: OperatorDatabaseRecord,
  scope: OperatorRadarScope,
): OperatorRadarProfile {
  const population = selectOperatorRadarPopulation(rows, target, scope)

  return {
    scope,
    populationCount: population.length,
    points: OPERATOR_RADAR_METRICS.map((radarMetric) => {
      const metric = getOperatorStatMetric(radarMetric.key)
      const source = buildOperatorMetricSource(population, radarMetric.key)
      const value = getOperatorMetricValue(target, radarMetric.key)
      return {
        ...radarMetric,
        value,
        score: calculateOperatorRadarScore(value, source, radarMetric.direction),
        validCount: source.filter((candidate) => (
          typeof candidate === 'number' && Number.isFinite(candidate)
        )).length,
        suffix: metric.suffix,
        valueDigits: metric.valueDigits,
      }
    }),
  }
}

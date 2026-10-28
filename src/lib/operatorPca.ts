import type { OperatorDatabaseRecord } from './operatorDatabase.ts'
import { getOperatorStatMetric } from './operatorStatistics.ts'
import { fitStandardizedPca, type StandardizedPcaResult } from './principalComponentAnalysis.ts'

// Attack interval already accounts for attack speed. Do not count both inputs.
export const OPERATOR_PCA_METRICS = ([
  'maxHp', 'attack', 'defense', 'magicResistance',
  'deploymentCost', 'blockCount', 'redeployTime', 'attackInterval',
] as const).map(getOperatorStatMetric)

export interface OperatorPcaPoint {
  operator: OperatorDatabaseRecord
  values: number[]
  standardized: number[]
  scores: number[]
  x: number
  y: number
}

export interface OperatorPcaResult {
  points: OperatorPcaPoint[]
  fit: StandardizedPcaResult
  targetCount: number
  excludedCount: number
  duplicateCount: number
}

export interface OperatorPcaNeighbor {
  point: OperatorPcaPoint
  distance: number
}

/** Fit once to the whole population. Display filters should only select points afterwards. */
export function runOperatorPca(rows: readonly OperatorDatabaseRecord[]): OperatorPcaResult {
  const seen = new Set<string>()
  const targets = rows.filter(({ operatorId }) => {
    if (seen.has(operatorId)) return false
    seen.add(operatorId)
    return true
  })
  const complete = targets.filter(operator => OPERATOR_PCA_METRICS.every(({ key }) => {
    const value = operator.stats[key]
    return typeof value === 'number' && Number.isFinite(value)
  }))
  const values = complete.map(operator => OPERATOR_PCA_METRICS.map(({ key }) => operator.stats[key]!))
  const fit = fitStandardizedPca(values)
  const points = complete.map((operator, index) => ({
    operator,
    values: values[index],
    standardized: fit.standardized[index],
    scores: fit.scores[index],
    x: fit.scores[index][0],
    y: fit.scores[index][1] ?? 0,
  }))
  return { points, fit, targetCount: targets.length, excludedCount: targets.length - complete.length,
    duplicateCount: rows.length - targets.length }
}

/** Search the supplied candidates using the full standardized feature space, not the plotted axes. */
export function findOperatorPcaNeighbors(
  points: readonly OperatorPcaPoint[],
  selectedOperatorId: string,
  limit = 3,
): OperatorPcaNeighbor[] {
  const selected = points.find(point => point.operator.operatorId === selectedOperatorId)
  if (!selected || !Number.isFinite(limit) || limit <= 0) return []
  return points.filter(point => point.operator.operatorId !== selectedOperatorId).map(point => ({
    point,
    distance: Math.hypot(...point.standardized.map((value, column) => value - selected.standardized[column])),
  })).sort((left, right) => left.distance - right.distance
    || left.point.operator.name.localeCompare(right.point.operator.name, 'ja')
    || left.point.operator.operatorId.localeCompare(right.point.operator.operatorId))
    .slice(0, Math.floor(limit))
}

import { createChartImageFilename } from './chartImageFilename.ts'
import type { EcdfGuideValues } from './enemyEcdfGuides.ts'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCountMode, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import type { EmpiricalCdfPoint, NumericStatistics } from './enemyStatistics.ts'
import type { WeightedHistogramObservation } from './enemyWeightedHistogram.ts'

/** Frequencies stay compressed, even when an enemy appears on many maps. */
export function calculateWeightedEmpiricalCdf(
  source: readonly WeightedHistogramObservation[],
): EmpiricalCdfPoint[] {
  const frequencies = new Map<number, number>()
  for (const { value, weight } of source) {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue
    frequencies.set(value, (frequencies.get(value) ?? 0) + weight)
  }
  const sorted = Array.from(frequencies, ([value, count]) => ({ value, count })).sort((left, right) => left.value - right.value)
  const total = sorted.reduce((sum, point) => sum + point.count, 0)
  let cumulativeCount = 0
  return sorted.map(({ value, count }) => {
    cumulativeCount += count
    return { value, count, cumulativeCount, proportion: cumulativeCount / total }
  })
}

export function getWeightedEnemyEcdfImageFilename(options: {
  mode: EnemyHistogramCountMode
  metric: string
  scope: string
  scale: string
  points: readonly EmpiricalCdfPoint[]
  statistics: NumericStatistics
  referenceVisibility: { mean: boolean; median: boolean }
  coverage: EnemyHistogramCounts['summary'] | null
  guides: EcdfGuideValues
}): string {
  const { mode, metric, scope, scale, referenceVisibility, guides } = options
  return createChartImageFilename(`敵_${metric}_累積分布`, [
    ENEMY_HISTOGRAM_COUNT_MODES.find((option) => option.key === mode)!.label,
    ...scope.split(/\s*·\s*/), scale === 'LOG' ? '対数' : '線形',
    [referenceVisibility.mean && '平均', referenceVisibility.median && '中央値'].filter(Boolean).join('-'),
    guides.x !== null && Number.isFinite(guides.x) && guides.x >= 0 ? `縦線${guides.x}` : null,
    guides.yPercent !== null && Number.isFinite(guides.yPercent) && guides.yPercent >= 0 && guides.yPercent <= 100
      ? `横線${guides.yPercent}%` : null,
  ])
}

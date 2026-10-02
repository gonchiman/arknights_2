import { createChartImageFilename, withChartImageAspect } from './chartImageFilename.ts'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCountMode } from './enemyHistogramCounts.ts'
import type { WeightedHistogramObservation } from './enemyWeightedHistogram.ts'
import { ENEMY_THRESHOLD_PIE_LABEL_LAYOUTS, type EnemyThresholdPieLabelLayout } from './enemyThresholdPieLayout.ts'

export interface EnemyThresholdDistribution {
  threshold: number
  count: number
  missingCount: number
  buckets: Array<{
    key: 'BELOW' | 'EQUAL' | 'ABOVE'
    label: string
    count: number
    proportion: number
  }>
}

function validateThreshold(threshold: number): void {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new RangeError('Threshold must be a finite number from 0 to 100')
  }
}

/** Compare original values directly; histogram rounding must not change membership. */
export function buildEnemyThresholdDistribution(
  observations: readonly WeightedHistogramObservation[],
  threshold: number,
): EnemyThresholdDistribution {
  validateThreshold(threshold)
  const buckets: EnemyThresholdDistribution['buckets'] = [
    { key: 'BELOW', label: `${threshold}未満`, count: 0, proportion: 0 },
    { key: 'EQUAL', label: `${threshold}と同じ`, count: 0, proportion: 0 },
    { key: 'ABOVE', label: `${threshold}超`, count: 0, proportion: 0 },
  ]
  let count = 0
  let missingCount = 0
  for (const { value, weight } of observations) {
    if (!Number.isFinite(weight) || weight <= 0) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      missingCount += weight
      continue
    }
    const index = value < threshold ? 0 : value === threshold ? 1 : 2
    buckets[index].count += weight
    count += weight
  }
  if (count > 0) {
    for (const bucket of buckets) bucket.proportion = bucket.count / count
  }
  return { threshold, count, missingCount, buckets }
}

export function createEnemyThresholdImageFilename(options: {
  threshold: number
  countMode: EnemyHistogramCountMode
  scopeLabel: string
  labelLayout?: EnemyThresholdPieLabelLayout
  aspectRatio?: number
}): string {
  const { threshold, countMode, scopeLabel, labelLayout = 'BELOW', aspectRatio } = options
  validateThreshold(threshold)
  return withChartImageAspect(createChartImageFilename('敵_術耐性_円グラフ', [
    `基準値${threshold}`,
    ENEMY_HISTOGRAM_COUNT_MODES.find((option) => option.key === countMode)!.label,
    ...scopeLabel.split(/\s*·\s*/),
    labelLayout === 'BELOW' ? '' : ENEMY_THRESHOLD_PIE_LABEL_LAYOUTS.find(({ key }) => key === labelLayout)!.label,
  ]), aspectRatio)
}

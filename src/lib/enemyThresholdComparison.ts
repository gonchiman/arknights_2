import type { EnemyRecord } from '../types/enemy.ts'
import { createChartImageFilename, withChartImageAspect } from './chartImageFilename.ts'
import { matchesEnemyFilters } from './enemyData.ts'
import { copyEnemyComparisonCondition, formatEnemyComparisonCondition, type EnemyComparisonCondition } from './enemyDistributionComparison.ts'
import {
  buildEnemyHistogramObservations,
  ENEMY_HISTOGRAM_COUNT_MODES,
  type EnemyHistogramCountMode,
  type EnemyHistogramCounts,
} from './enemyHistogramCounts.ts'
import { matchesEnemyNumericConditions } from './enemyNumericFilters.ts'
import { buildEnemyThresholdDistribution, type EnemyThresholdDistribution } from './enemyThresholdDistribution.ts'
import { ENEMY_THRESHOLD_PIE_LABEL_LAYOUTS, type EnemyThresholdPieLabelLayout } from './enemyThresholdPieLayout.ts'
import { ENEMY_THRESHOLD_BAR_LAYOUTS, type EnemyThresholdBarLayout } from './enemyThresholdBarLayout.ts'

export interface EnemyThresholdComparisonSeries {
  condition: EnemyComparisonCondition
  label: string
  matchedCount: number
  count: number
  missingCount: number
  distribution: EnemyThresholdDistribution
}

export interface EnemyThresholdComparison {
  threshold: number
  series: EnemyThresholdComparisonSeries[]
}

export function createEnemyThresholdComparisonConditions(): EnemyComparisonCondition[] {
  return (['NORMAL', 'ELITE', 'BOSS'] as const).map((levelType, index) => ({
    id: index + 1,
    colorIndex: index,
    filters: { levelType },
    numericConditions: [],
    visible: true,
  }))
}

export function buildEnemyThresholdComparison(
  rows: readonly EnemyRecord[],
  conditions: readonly EnemyComparisonCondition[],
  threshold: number,
  countMode: EnemyHistogramCountMode,
  counts: EnemyHistogramCounts | null,
): EnemyThresholdComparison {
  // Validate even when no comparison conditions remain.
  buildEnemyThresholdDistribution([], threshold)
  const uniqueRows = [...new Map(rows.map((row) => [row.id, row])).values()]
  const series = conditions.map((source): EnemyThresholdComparisonSeries => {
    // The saved result must stay independent of subsequent filter edits.
    const condition = copyEnemyComparisonCondition(source)
    const matchedRows = uniqueRows.filter((row) => (
      matchesEnemyFilters(row, { query: '', levelType: condition.filters.levelType })
      && matchesEnemyNumericConditions(row, condition.numericConditions)
    ))
    const distribution = buildEnemyThresholdDistribution(
      buildEnemyHistogramObservations(matchedRows, (row) => row.stats.magicResistance, countMode, counts),
      threshold,
    )
    return {
      condition,
      label: formatEnemyComparisonCondition(condition),
      matchedCount: matchedRows.length,
      count: distribution.count,
      missingCount: distribution.missingCount,
      distribution,
    }
  })
  return { threshold, series }
}

export function createEnemyThresholdComparisonImageFilename(options: {
  comparison: EnemyThresholdComparison
  countMode: EnemyHistogramCountMode
  labelLayout?: EnemyThresholdPieLabelLayout
  aspectRatio?: number
}): string {
  const { comparison, countMode, labelLayout = 'BELOW', aspectRatio } = options
  return withChartImageAspect(createChartImageFilename('敵_術耐性_円グラフ比較', [
    ...thresholdComparisonFilenameParts(comparison, countMode),
    labelLayout === 'BELOW' ? '' : ENEMY_THRESHOLD_PIE_LABEL_LAYOUTS.find(({ key }) => key === labelLayout)!.label,
  ]), aspectRatio)
}

export function createEnemyThresholdBarComparisonImageFilename(options: {
  comparison: EnemyThresholdComparison
  countMode: EnemyHistogramCountMode
  labelLayout?: EnemyThresholdBarLayout
  aspectRatio?: number
}): string {
  const { comparison, countMode, labelLayout = 'AXIS', aspectRatio } = options
  return withChartImageAspect(createChartImageFilename('敵_術耐性_100%積み上げ横棒', [
    ...thresholdComparisonFilenameParts(comparison, countMode),
    ENEMY_THRESHOLD_BAR_LAYOUTS.find(({ key }) => key === labelLayout)!.label,
  ]), aspectRatio)
}

function thresholdComparisonFilenameParts(comparison: EnemyThresholdComparison, countMode: EnemyHistogramCountMode): string[] {
  buildEnemyThresholdDistribution([], comparison.threshold)
  return [
    `基準値${comparison.threshold}`,
    ENEMY_HISTOGRAM_COUNT_MODES.find((option) => option.key === countMode)!.label,
    ...comparison.series.filter((series) => series.condition.visible)
      .map((series, index) => `条件${index + 1}-${series.label.replace(/\s*·\s*/g, '-')}`),
  ]
}

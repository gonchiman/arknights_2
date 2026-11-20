import { createChartImageFilename } from './chartImageFilename.ts'
import type { EnemyBoxplotComparison, EnemyBoxplotRange, EnemyBoxplotScale } from './enemyBoxplotComparison.ts'
import {
  ENEMY_HISTOGRAM_COUNT_MODES, getEnemySpawnCoverageLabel,
  type EnemyHistogramCountMode, type EnemyHistogramCounts,
} from './enemyHistogramCounts.ts'
import type { EnemyHistogramAggregationVersion } from './enemyHistogramSnapshot.ts'

export interface EnemyBoxplotComparisonImageSnapshot {
  data: EnemyBoxplotComparison
  scale: EnemyBoxplotScale
  range: EnemyBoxplotRange
  scopeLabel: string
  countMode: EnemyHistogramCountMode
  aggregationVersion?: EnemyHistogramAggregationVersion
  coverage?: EnemyHistogramCounts['summary'] | null
}

export const ENEMY_BOXPLOT_IMAGE_TITLE = '防御力・術耐性の箱ひげ図'
const SCALE_LABELS: Record<EnemyBoxplotScale, string> = { RAW: '元の値', MEDIAN: '中央値＝1' }
const RANGE_LABELS: Record<EnemyBoxplotRange, string> = { ALL: '全範囲', WHISKERS: '箱とひげ' }

/** Keep the open save dialog independent of later filtering and count-data updates. */
export function createEnemyBoxplotComparisonImageSnapshot(
  input: EnemyBoxplotComparisonImageSnapshot,
): EnemyBoxplotComparisonImageSnapshot {
  return {
    ...input,
    data: {
      ...input.data,
      series: input.data.series.map(series => ({
        ...series,
        statistics: series.statistics ? {
          ...series.statistics,
          outliers: series.statistics.outliers.map(outlier => ({ ...outlier })),
        } : null,
      })),
    },
    aggregationVersion: input.aggregationVersion ? { ...input.aggregationVersion } : undefined,
    coverage: input.coverage ? { ...input.coverage } : input.coverage,
  }
}

export function getEnemyBoxplotComparisonImageFilename(snapshot: EnemyBoxplotComparisonImageSnapshot): string {
  return createChartImageFilename('敵', [
    snapshot.aggregationVersion && `集計${snapshot.aggregationVersion.id}`,
    ENEMY_BOXPLOT_IMAGE_TITLE,
    ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === snapshot.countMode)!.label,
    snapshot.scopeLabel,
    SCALE_LABELS[snapshot.scale],
    RANGE_LABELS[snapshot.range],
  ])
}

export function getEnemyBoxplotComparisonImageConditions(snapshot: EnemyBoxplotComparisonImageSnapshot): string {
  const mode = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === snapshot.countMode)!
  const coverage = !snapshot.coverage || snapshot.countMode === 'TYPES' ? undefined
    : snapshot.countMode === 'SPAWNS' ? getEnemySpawnCoverageLabel(snapshot.coverage)
    : `収録 ${snapshot.coverage.mapCount.toLocaleString('ja-JP')}マップ`
  return [snapshot.aggregationVersion?.label, snapshot.scopeLabel, mode.label,
    SCALE_LABELS[snapshot.scale], RANGE_LABELS[snapshot.range], coverage].filter(Boolean).join(' · ')
}

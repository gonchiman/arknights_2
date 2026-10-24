import { createChartImageFilename } from './chartImageFilename.ts'
import { getMapCoverageCategories, summarizeMapCoverage } from './enemyMapCoverage.ts'
import type { EnemyMapCoverageMode, MapCoverageStatus, MapCoverageSummary } from './enemyMapCoverage.ts'
import type { MapSummary } from '../types/map.ts'
import type { EnemyAggregationVersion } from './enemyAggregationContract.ts'
import { getEnemyAggregationFilename } from './enemyAggregationData.ts'

export const MAP_COVERAGE_STATUS_KEYS = ['included', 'excluded', 'missing'] as const
export const MAP_COVERAGE_STATUS_LABELS: Record<MapCoverageStatus, string> = {
  included: '集計対象', excluded: '集計対象外', missing: 'データ未取得',
}
export const MAP_COVERAGE_COLORS: Record<MapCoverageStatus, string> = {
  included: '#417897', excluded: '#ad7c49', missing: '#d0d0d0',
}
export const MAP_COVERAGE_MODE_LABELS: Record<EnemyMapCoverageMode, string> = {
  SPAWNS: '出現回数', MAPS: '登場マップ数',
}

export interface EnemyMapCoverageChartSnapshot {
  mode: EnemyMapCoverageMode
  categories: ReturnType<typeof getMapCoverageCategories>
  totals: MapCoverageSummary
  filename: string
  aggregationVersion?: Pick<EnemyAggregationVersion, 'id' | 'label' | 'sourceRevision' | 'ruleVersion'>
}

/** Copy the displayed aggregates so later source or selection changes cannot alter an export. */
export function createEnemyMapCoverageChartSnapshot(
  maps: readonly MapSummary[], mode: EnemyMapCoverageMode,
  version?: Pick<EnemyAggregationVersion, 'id' | 'label' | 'sourceRevision' | 'ruleVersion'>,
): EnemyMapCoverageChartSnapshot {
  return {
    mode,
    categories: getMapCoverageCategories(maps, mode).map((category) => ({ ...category })),
    totals: { ...summarizeMapCoverage(maps, mode) },
    filename: getEnemyAggregationFilename(createChartImageFilename('集計マップ', [MAP_COVERAGE_MODE_LABELS[mode], '分類別', '100%横積上げ']), version?.id),
    ...(version ? { aggregationVersion: { id: version.id, label: version.label, sourceRevision: version.sourceRevision, ruleVersion: version.ruleVersion } } : {}),
  }
}

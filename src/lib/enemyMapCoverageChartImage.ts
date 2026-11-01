import { createChartImageFilename } from './chartImageFilename.ts'
import { getMapCoverageDisplayCategories, summarizeMapCoverageDisplay } from './enemyMapCoverage.ts'
import type { EnemyMapCoverageMode, MapCoverageDisplayStatus, MapCoverageDisplaySummary } from './enemyMapCoverage.ts'
import type { MapSummary } from '../types/map.ts'
import type { EnemyAggregationVersion } from './enemyAggregationContract.ts'
import { getEnemyAggregationFilename } from './enemyAggregationData.ts'

export const MAP_COVERAGE_STATUS_KEYS = ['included', 'conditional', 'excluded', 'story', 'pending', 'missing'] as const
export const MAP_COVERAGE_STATUS_LABELS: Record<MapCoverageDisplayStatus, string> = {
  included: '通常の集計対象', conditional: '条件付き集計対象',
  excluded: '集計対象外', story: '物語環境・対象外', pending: '解析保留', missing: 'データ未取得',
}
export const MAP_COVERAGE_COLORS: Record<MapCoverageDisplayStatus, string> = {
  included: '#417897', conditional: '#8fb6cc', excluded: '#719674', story: '#9278ab', pending: '#ad7c49', missing: '#d0d0d0',
}
/** Included is the total in summaries; its bar segment contains only regular aggregation. */
export function getMapCoverageSegmentCount(summary: MapCoverageDisplaySummary, status: MapCoverageDisplayStatus): number {
  return status === 'included' ? summary.regular : summary[status]
}
export const MAP_COVERAGE_MODE_LABELS: Record<EnemyMapCoverageMode, string> = {
  SPAWNS: '出現回数', MAPS: '登場マップ数',
}

export interface EnemyMapCoverageChartSnapshot {
  mode: EnemyMapCoverageMode
  categories: ReturnType<typeof getMapCoverageDisplayCategories>
  totals: MapCoverageDisplaySummary
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
    categories: getMapCoverageDisplayCategories(maps, mode).map((category) => ({ ...category })),
    totals: { ...summarizeMapCoverageDisplay(maps, mode) },
    filename: getEnemyAggregationFilename(createChartImageFilename('集計マップ', [MAP_COVERAGE_MODE_LABELS[mode], '分類別', '100%横積上げ']), version?.id),
    ...(version ? { aggregationVersion: { id: version.id, label: version.label, sourceRevision: version.sourceRevision, ruleVersion: version.ruleVersion } } : {}),
  }
}

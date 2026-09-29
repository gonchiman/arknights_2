import { createChartImageFilename } from './chartImageFilename.ts'
import type { EnemyJointDistribution } from './enemyJointDistribution.ts'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'
import type { EnemyHeatmapColorScale } from './enemyHeatmapColor.ts'

export function getEnemyJointImageConditions(
  distribution: EnemyJointDistribution,
  scopeLabel: string,
  coverage: EnemyHistogramCounts['summary'] | null = null,
): string {
  const mode = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === distribution.countMode)!
  const conditions = [scopeLabel, `${distribution.count.toLocaleString('ja-JP')}${mode.unit}`]
  if (distribution.missingCount > 0) conditions.push(`値なし等 ${distribution.missingCount.toLocaleString('ja-JP')}${mode.unit}を除外`)
  if (coverage && distribution.countMode !== 'TYPES') conditions.push(distribution.countMode === 'MAPS'
    ? `収録 ${coverage.mapCount.toLocaleString('ja-JP')}マップ`
    : `出現数確定 ${coverage.spawnMapCount.toLocaleString('ja-JP')}マップ`)
  return conditions.join(' · ')
}

/** Describe the selected view without embedding the computed cell counts. */
export function getEnemyJointImageFilename(
  distribution: EnemyJointDistribution,
  scopeLabel: string,
  _coverage: EnemyHistogramCounts['summary'] | null = null,
  colorScale: EnemyHeatmapColorScale = 'LINEAR',
): string {
  return createChartImageFilename('敵_HP_術耐性_ヒートマップ', [
    ENEMY_HISTOGRAM_COUNT_MODES.find((option) => option.key === distribution.countMode)!.label,
    ...scopeLabel.split(/\s*·\s*/),
    colorScale === 'SQRT' ? '色平方根' : '色線形',
  ])
}

import { createChartImageFilename, formatChartFilenameValues, withChartImageAspect } from './chartImageFilename.ts'
import type { EnemyHeatmapColorScale } from './enemyHeatmapColor.ts'
import type { SurtrRemnantAttackAssumptions } from './surtrRemnantAttacks.ts'
import type { SurtrUnequippedColumnOrder, SurtrUnequippedComparisonBase, SurtrUnequippedComparisonQuantity, SurtrUnequippedLayout, SurtrUnequippedMetric, SurtrUnequippedRankMode } from './surtrUnequippedComparison.ts'

export interface SurtrUnequippedTableImageMetadata {
  skillLabel: string
  level: number
  trust: number
  potential: number
  blocking: boolean
  remnantAssumptions?: SurtrRemnantAttackAssumptions
  remnantActive?: boolean
}

/** Name the captured table settings, independently of the panel 04 chart settings. */
export function getSurtrUnequippedTableImageFilename(options: {
  metadata: SurtrUnequippedTableImageMetadata
  series: readonly { id: string; label: string }[]
  resistances: readonly number[]
  metric: SurtrUnequippedMetric
  layout: SurtrUnequippedLayout
  precision: number
  blockingComparison?: readonly { blocking: boolean }[]
  rankMode?: SurtrUnequippedRankMode
  columnOrder?: SurtrUnequippedColumnOrder
  colorScale?: boolean
  colorScaleMode?: EnemyHeatmapColorScale
  comparisonBase?: SurtrUnequippedComparisonBase
  quantity?: SurtrUnequippedComparisonQuantity
}, aspectRatio?: number): string {
  const { metadata, series, resistances, metric, layout, precision, blockingComparison } = options
  const modules = series.filter(item => item.id !== 'none').map(item => item.label)
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 0
  const expectedDamage = options.quantity === 'expected-damage'
  const baseLabel = options.comparisonBase === 'previous' ? '前段階比較表' : '未装備比較表'
  const metricLabel = metric === 'difference' ? expectedDamage ? 'ダメージ差' : 'DPS差' : metric === 'ratio' ? '比率' : '増加率'
  const layoutLabel = layout === 'combined' ? expectedDamage ? '期待値＋比較値' : 'DPS＋比較値' : '比較値のみ'
  const assumptions = expectedDamage ? metadata.remnantAssumptions : undefined
  const filename = createChartImageFilename(expectedDamage ? `スルト_余燼_総ダメージ期待値_${baseLabel}` : `スルト_S3_${baseLabel}`, [
    // Keep the expectation's quantity, metric and assumptions readable even when
    // long module names force the shared filename helper to omit later parts.
    ...(expectedDamage ? [metricLabel, layoutLabel, 'CT一様', ...(assumptions ? [
      `予備動作${assumptions.windup}秒`,
      assumptions.ctCarry === 'time' ? 'CT秒数維持' : 'CT割合維持',
      assumptions.includeRetreatHit ? '退場時含む' : '退場時除外',
    ] : [])] : []),
    metadata.skillLabel,
    ...(!expectedDamage ? [metricLabel, layoutLabel] : []),
    ...(options.colorScale ? [options.colorScaleMode === 'SQRT' ? 'カラースケール平方根' : 'カラースケール'] : []),
    `昇進2Lv${metadata.level}`,
    `信頼${metadata.trust}`,
    `潜在${metadata.potential}`,
    ...(!expectedDamage && metadata.remnantActive ? ['余燼中'] : []),
    blockingComparison !== undefined ? 'ブロック条件比較' : metadata.blocking ? 'ブロック中' : '未ブロック',
    ...(blockingComparison !== undefined && options.columnOrder === 'blocking' ? ['ブロック条件別'] : []),
    modules.join('-') || 'MOD選択なし',
    resistances.length ? `術耐性${formatChartFilenameValues(resistances)}` : '術耐性なし',
    `小数${digits}桁`,
    ...(options.rankMode === 'inline' ? ['ランク併記'] : options.rankMode === 'merged' ? ['ランク結合'] : []),
  ])
  return withChartImageAspect(filename, aspectRatio)
}

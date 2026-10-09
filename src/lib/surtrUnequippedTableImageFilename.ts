import { createChartImageFilename, formatChartFilenameValues, withChartImageAspect } from './chartImageFilename.ts'
import type { EnemyHeatmapColorScale } from './enemyHeatmapColor.ts'
import type { SurtrRemnantAttackAssumptions } from './surtrRemnantAttacks.ts'
import { getSurtrComparisonBaseLabel } from './surtrUnequippedComparison.ts'
import type { SurtrComparisonImageLayout } from './surtrComparisonImageLayout.ts'
import type { SurtrComparisonImageNumberSize } from './surtrComparisonImageNumberSize.ts'
import type { SurtrUnequippedColumnOrder, SurtrUnequippedComparisonBase, SurtrUnequippedComparisonQuantity, SurtrUnequippedLayout, SurtrUnequippedMetric, SurtrUnequippedRankMode } from './surtrUnequippedComparison.ts'

export interface SurtrUnequippedTableImageMetadata {
  skillLabel: string
  level: number
  trust: number
  potential: number
  potentials?: readonly number[]
  blocking: boolean
  remnantAssumptions?: SurtrRemnantAttackAssumptions
  remnantActive?: boolean
}

/** Name the captured table settings, independently of the panel 04 chart settings. */
export function getSurtrUnequippedTableImageFilename(options: {
  metadata: SurtrUnequippedTableImageMetadata
  series: readonly { id: string; label: string; moduleStageId?: string; potential?: number }[]
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
  imageLayout?: SurtrComparisonImageLayout
  moduleLevel?: number
  numberSize?: SurtrComparisonImageNumberSize
}, aspectRatio?: number): string {
  const { metadata, series, resistances, metric, layout, precision, blockingComparison } = options
  const modules = [...new Set(series.filter(item => (item.moduleStageId ?? item.id.replace(/:pot[1-6]$/, '')) !== 'none')
    .map(item => item.label.replace(/\s*潜在[1-6]\s*$/, '')))]
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 0
  const expectedDamage = options.quantity === 'expected-damage'
  const baseLabel = `${getSurtrComparisonBaseLabel(options.comparisonBase ?? 'unequipped')}比較表`
  const potentials = getSurtrUnequippedTableImagePotentials(metadata)
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
    ...(options.imageLayout === 'transpose' ? ['術耐性を列に']
      : options.imageLayout === 'stacked' ? ['ブロック条件を上下に']
      : options.imageLayout === 'split' ? [`段階別${options.moduleLevel === undefined ? '' : `Lv${options.moduleLevel}`}`] : []),
    ...(options.numberSize === 'auto' ? ['数値自動']
      : options.numberSize === '150' ? ['数値150%']
      : options.numberSize === '200' ? ['数値200%'] : []),
    ...(!expectedDamage ? [metricLabel, layoutLabel] : []),
    ...(options.colorScale ? [options.colorScaleMode === 'SQRT' ? 'カラースケール平方根' : 'カラースケール'] : []),
    `昇進2Lv${metadata.level}`,
    `信頼${metadata.trust}`,
    `潜在${potentials.join('・')}`,
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

export function getSurtrUnequippedTableImagePotentials(metadata: SurtrUnequippedTableImageMetadata): readonly number[] {
  return metadata.potentials?.length ? [...new Set(metadata.potentials)].sort((a, b) => a - b) : [metadata.potential]
}

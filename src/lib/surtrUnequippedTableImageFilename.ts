import { createChartImageFilename, formatChartFilenameValues, withChartImageAspect } from './chartImageFilename.ts'
import type { EnemyHeatmapColorScale } from './enemyHeatmapColor.ts'
import type { SurtrRemnantAttackAssumptions } from './surtrRemnantAttacks.ts'
import type { SurtrRemnantComparisonLayout } from './surtrRemnantComparison.ts'
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
  titleSize?: number
  detailSize?: number
  displayMode?: 'comparison' | 'winner'
  winnerColor?: 'module' | 'none'
  winnerGapShading?: boolean
  winnerStages?: readonly { id: string }[]
  remnantComparison?: readonly { remnantActive: boolean }[]
  remnantLayout?: SurtrRemnantComparisonLayout
}, aspectRatio?: number): string {
  const { metadata, series, resistances, metric, layout, precision, blockingComparison } = options
  const modules = [...new Set(series.filter(item => (item.moduleStageId ?? item.id.replace(/:pot[1-6]$/, '')) !== 'none')
    .map(item => item.label.replace(/\s*潜在[1-6]\s*$/, '')))]
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 0
  const expectedDamage = options.quantity === 'expected-damage'
  const remnantComparison = options.remnantComparison?.some(item => !item.remnantActive) === true
    && options.remnantComparison.some(item => item.remnantActive)
  const winner = options.displayMode === 'winner'
  const selectedIds = options.winnerStages && new Set(options.winnerStages.map(stage => stage.id))
  const winnerSeries = winner && selectedIds ? series.filter(item => selectedIds.has(item.moduleStageId ?? item.id.replace(/:pot[1-6]$/, ''))) : series
  const winnerStagesByPotential = new Map<number, Set<string>>()
  winnerSeries.forEach(item => {
    const potential = item.potential ?? Number(/:pot([1-6])$/.exec(item.id)?.[1] ?? 1)
    const ids = winnerStagesByPotential.get(potential) ?? new Set<string>()
    ids.add(item.moduleStageId ?? item.id.replace(/:pot[1-6]$/, ''))
    winnerStagesByPotential.set(potential, ids)
  })
  const winnerGapActive = winner && options.winnerColor !== 'none' && options.winnerGapShading
    && [...winnerStagesByPotential.values()].some(ids => ids.size >= 2)
  const baseLabel = winner ? 'DPS最大MOD表' : `${getSurtrComparisonBaseLabel(options.comparisonBase ?? 'unequipped')}比較表`
  const potentials = getSurtrUnequippedTableImagePotentials(metadata)
  const metricLabel = metric === 'difference' ? expectedDamage ? 'ダメージ差' : 'DPS差' : metric === 'ratio' ? '比率' : '増加率'
  const layoutLabel = layout === 'combined' ? expectedDamage ? '期待値＋比較値' : 'DPS＋比較値' : '比較値のみ'
  const assumptions = expectedDamage ? metadata.remnantAssumptions : undefined
  const filename = createChartImageFilename(expectedDamage ? `スルト_余燼_総ダメージ期待値_${baseLabel}` : `スルト_S3_${baseLabel}`, [
    ...(remnantComparison ? ['余燼なし-中比較', options.remnantLayout === 'common' ? '共通値をまとめる' : '余燼を列に'] : []),
    ...(winner ? [options.winnerColor === 'none' ? '色なし' : 'MOD色',
      ...(winnerGapActive ? ['差濃淡0-30%以上'] : [])] : []),
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
    ...(options.titleSize !== undefined || options.detailSize !== undefined ? [`文字${options.titleSize ?? 12}-${options.detailSize ?? 8}px`] : []),
    ...(!expectedDamage && !winner ? [metricLabel, layoutLabel] : []),
    ...(!winner && options.colorScale ? [options.colorScaleMode === 'SQRT' ? 'カラースケール平方根' : 'カラースケール'] : []),
    `昇進2Lv${metadata.level}`,
    `信頼${metadata.trust}`,
    `潜在${potentials.join('・')}`,
    ...(!expectedDamage && !remnantComparison && metadata.remnantActive ? ['余燼中'] : []),
    blockingComparison !== undefined ? 'ブロック条件比較' : metadata.blocking ? 'ブロック中' : '未ブロック',
    ...(!winner && blockingComparison !== undefined && options.columnOrder === 'blocking' ? ['ブロック条件別'] : []),
    (winner ? [...new Set(winnerSeries.map(item => item.label.replace(/\s*潜在[1-6]\s*$/, '')))] : modules).join('-') || 'MOD選択なし',
    resistances.length ? `術耐性${formatChartFilenameValues(resistances)}` : '術耐性なし',
    ...(!winner ? [`小数${digits}桁`] : []),
    ...(options.rankMode === 'inline' ? ['ランク併記'] : options.rankMode === 'merged' ? ['ランク結合'] : []),
  ])
  return withChartImageAspect(filename, aspectRatio)
}

export function getSurtrUnequippedTableImagePotentials(metadata: SurtrUnequippedTableImageMetadata): readonly number[] {
  return metadata.potentials?.length ? [...new Set(metadata.potentials)].sort((a, b) => a - b) : [metadata.potential]
}

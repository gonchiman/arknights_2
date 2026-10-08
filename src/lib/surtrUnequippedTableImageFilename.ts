import { createChartImageFilename, formatChartFilenameValues, withChartImageAspect } from './chartImageFilename.ts'
import type { SurtrUnequippedColumnOrder, SurtrUnequippedLayout, SurtrUnequippedMetric, SurtrUnequippedRankMode } from './surtrUnequippedComparison.ts'

export interface SurtrUnequippedTableImageMetadata {
  skillLabel: string
  level: number
  trust: number
  potential: number
  blocking: boolean
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
}, aspectRatio?: number): string {
  const { metadata, series, resistances, metric, layout, precision, blockingComparison } = options
  const modules = series.filter(item => item.id !== 'none').map(item => item.label)
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 0
  const filename = createChartImageFilename('スルト_S3_未装備比較表', [
    metadata.skillLabel,
    metric === 'difference' ? 'DPS差' : metric === 'ratio' ? '比率' : '増加率',
    layout === 'combined' ? 'DPS＋比較値' : '比較値のみ',
    ...(options.colorScale ? ['カラースケール'] : []),
    `昇進2Lv${metadata.level}`,
    `信頼${metadata.trust}`,
    `潜在${metadata.potential}`,
    blockingComparison !== undefined ? 'ブロック条件比較' : metadata.blocking ? 'ブロック中' : '未ブロック',
    ...(blockingComparison !== undefined && options.columnOrder === 'blocking' ? ['ブロック条件別'] : []),
    modules.join('-') || 'MOD選択なし',
    resistances.length ? `術耐性${formatChartFilenameValues(resistances)}` : '術耐性なし',
    `小数${digits}桁`,
    ...(options.rankMode === 'inline' ? ['ランク併記'] : options.rankMode === 'merged' ? ['ランク結合'] : []),
  ])
  return withChartImageAspect(filename, aspectRatio)
}

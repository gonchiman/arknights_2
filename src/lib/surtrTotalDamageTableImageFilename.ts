import { createChartImageFilename, formatChartFilenameValues, withChartImageAspect } from './chartImageFilename.ts'
import type { SurtrTotalDamageAssumptions } from './surtrTotalDamage.ts'
import type { SurtrTotalDamageTableDisplayMode, SurtrTotalDamageTableLayout, SurtrTotalDamageWinnerColor } from './surtrTotalDamageTable.ts'
import { SURTR_TOTAL_DAMAGE_WINNER_GAP_MAX_PERCENT } from './surtrTotalDamageTable.ts'
import {
  DEFAULT_SURTR_TOTAL_DAMAGE_TABLE_TITLE_SIZE, DEFAULT_SURTR_TOTAL_DAMAGE_TABLE_DETAIL_SIZE,
  type SurtrTotalDamageTableTitleSize, type SurtrTotalDamageTableDetailSize,
} from './surtrTotalDamageTableImageTypography.ts'

export interface SurtrTotalDamageTableImageMetadata {
  skillLabel: string
  level: number
  trust: number
  potential: number
  blocking: boolean
}

export interface SurtrTotalDamageTableImageFilenameOptions {
  metadata: SurtrTotalDamageTableImageMetadata
  times: readonly number[]
  resistances: readonly number[]
  series: readonly { id: string; label: string }[]
  assumptions: SurtrTotalDamageAssumptions
  layout: SurtrTotalDamageTableLayout
  precision: number
  colorScale: 'none' | 'LINEAR' | 'SQRT'
  displayMode?: SurtrTotalDamageTableDisplayMode
  winnerColor?: SurtrTotalDamageWinnerColor
  winnerGapShading?: boolean
  titleSize?: SurtrTotalDamageTableTitleSize
  detailSize?: SurtrTotalDamageTableDetailSize
}

/** Describe the saved matrix, independently of live panel controls. */
export function getSurtrTotalDamageTableImageFilename(
  options: SurtrTotalDamageTableImageFilenameOptions,
  aspectRatio?: number,
): string {
  const { metadata, assumptions } = options
  const winner = options.displayMode === 'winner'
  const layout = winner ? options.layout === 'time' ? '時間別' : '術耐性別'
    : options.layout === 'module' ? 'MOD別' : options.layout === 'resistance' ? '術耐性別' : '時間別'
  const color = options.colorScale === 'SQRT' ? '平方根色' : options.colorScale === 'LINEAR' ? '線形色' : '色なし'
  const precision = Number.isInteger(options.precision) && options.precision >= 0 && options.precision <= 3 ? options.precision : 0
  const modules = options.series.map(item => item.id === 'none' ? '未装備'
    : item.label.replace(/^MOD\s*/i, '').replace(/Lv\./i, 'Lv').replace(/\s+/g, '')).join('-') || 'MODなし'
  return withChartImageAspect(createChartImageFilename(winner ? 'スルト_S3最大ダメージMOD表' : 'スルト_S3総ダメージ表', [
    layout,
    metadata.skillLabel,
    ...(winner && options.winnerGapShading && options.winnerColor !== 'none' && options.series.length >= 2
      ? [`差濃淡0-${SURTR_TOTAL_DAMAGE_WINNER_GAP_MAX_PERCENT}%以上`] : []),
    ...(options.titleSize !== undefined || options.detailSize !== undefined
      ? [`文字${options.titleSize ?? DEFAULT_SURTR_TOTAL_DAMAGE_TABLE_TITLE_SIZE}-${options.detailSize ?? DEFAULT_SURTR_TOTAL_DAMAGE_TABLE_DETAIL_SIZE}px`] : []),
    `術耐性${formatChartFilenameValues(options.resistances)}`,
    `時刻${formatChartFilenameValues(options.times)}s`,
    modules,
    `E2Lv${metadata.level}-信頼${metadata.trust}-潜在${metadata.potential}`,
    metadata.blocking ? '対象ブロック' : '未ブロック',
    `初攻${assumptions.firstAttackStart}s-命中${assumptions.hitDelay}s`,
    assumptions.ctCarry === 'time' ? 'CT秒維持' : 'CT割合維持',
    assumptions.includeRetreatHit ? '退場時含む' : '退場時除外',
    winner ? options.winnerColor === 'none' ? '色なし' : 'MOD色' : `${precision}桁-${color}`,
  ]), aspectRatio)
}

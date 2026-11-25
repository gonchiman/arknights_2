import { createZeroBasedValueAxis, type ZeroBasedValueAxis } from './chartValueAxis.ts'
import type { SkillRankStatistics } from './damageThreeSkillRankStatistics.ts'

export const DAMAGE_DISTRIBUTION_AXIS_TITLE = '主攻撃1回のダメージ'
export const DAMAGE_SERIES = [
  { series: 'physical', label: '物理化' },
  { series: 'arts', label: '術化' },
] as const

type HistogramRow = SkillRankStatistics & { defense: number }
type HistogramBin = HistogramRow['histogram'][number]
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

export interface DamageThreeDistributionHistogram {
  row: HistogramRow
  axis: ZeroBasedValueAxis
}

export function getDamageThreeDistributionHistogram(
  rows: readonly SkillRankStatistics[], resistance: number,
): DamageThreeDistributionHistogram | null {
  const row = rows.find((item): item is HistogramRow =>
    item.resistance === resistance && item.defense !== null && item.count > 0)
  if (!row) return null
  // Keep the number of stages on a common scale across resistance conditions.
  const peak = Math.max(0, ...rows.flatMap(item => item.histogram.map(bin => Math.max(bin.physical, bin.arts))))
  return { row, axis: createZeroBasedValueAxis(peak) }
}

export function damageBinLabel(bin: HistogramBin) {
  return NUMBER.format(bin.lower) + (bin.upper === null ? '以上' : '～')
}

export function describeDamageBin(bin: HistogramBin) {
  const upper = bin.upper === null ? '' : NUMBER.format(bin.upper) + '未満'
  const counts = DAMAGE_SERIES.map(({ series, label }) => `${label} ${NUMBER.format(bin[series])}段階`)
  return [`${NUMBER.format(bin.lower)}以上${upper}`, ...counts].join('、')
}

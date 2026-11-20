import type { EnemyRankBandMetric } from './enemyRankBandStatistics.ts'

export const ENEMY_RANK_BAND_METRIC_LABELS: Record<EnemyRankBandMetric, string> = {
  width: '幅（最大−最小）',
  mean: '平均',
  standardDeviation: '標準偏差',
  variance: '分散',
}

const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const SMALL_NUMBER = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 3 })

export function formatRankBandStatistic(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  return Math.abs(value) < 0.005 ? SMALL_NUMBER.format(value) : NUMBER.format(value)
}

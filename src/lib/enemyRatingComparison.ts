import {
  buildEnemyHistogramObservations,
  type EnemyHistogramCountMode,
  type EnemyHistogramCounts,
} from './enemyHistogramCounts.ts'
import { buildEnemyRatingHistogramBins, formatEnemyRatingHistogramRangeLines } from './enemyRatingHistogram.ts'
import { buildHistogramCumulativeRows } from './histogramCumulative.ts'
import type { EnemyRecord } from '../types/enemy.ts'

export const ENEMY_RATING_COMPARISON_LAYOUTS = [
  { key: 'GROUPED', label: '集合棒と累積帯' },
  { key: 'CUMULATIVE', label: '累積折れ線' },
  { key: 'MIRRORED', label: '左右の横棒' },
] as const

export type EnemyRatingComparisonLayout = typeof ENEMY_RATING_COMPARISON_LAYOUTS[number]['key']

export const ENEMY_RATING_COMPARISON_METRICS = [
  { key: 'defense', label: '防御力' },
  { key: 'magicResistance', label: '術耐性' },
] as const

export type EnemyRatingComparisonMetric = typeof ENEMY_RATING_COMPARISON_METRICS[number]['key']

export interface EnemyRatingComparisonStat {
  range: string
  cumulativeRange: string
  count: number
  share: number | null
  cumulativeShare: number | null
  cumulativeCount: number | null
}

export interface EnemyRatingComparison {
  rows: { rank: string; stats: Record<EnemyRatingComparisonMetric, EnemyRatingComparisonStat> }[]
  totals: Record<EnemyRatingComparisonMetric, { valid: number; missing: number }>
  hasData: boolean
}

export function buildEnemyRatingComparison(
  rows: readonly EnemyRecord[],
  mode: EnemyHistogramCountMode,
  counts: EnemyHistogramCounts | null,
): EnemyRatingComparison {
  function summarize(metric: EnemyRatingComparisonMetric) {
    const observations = buildEnemyHistogramObservations(rows, enemy => enemy.stats[metric], mode, counts)
    const bins = buildEnemyRatingHistogramBins(observations, metric)
    const valid = bins.reduce((sum, bin) => sum + bin.count, 0)
    const missing = observations.reduce((sum, { value, weight }) => (
      Number.isFinite(weight) && weight > 0 && (value === null || !Number.isFinite(value)) ? sum + weight : sum
    ), 0)
    const cumulativeRows = buildHistogramCumulativeRows(bins, valid)
    const ranks = cumulativeRows.map(({ bin, proportion, cumulativeProportion, cumulativeCount }) => {
      const range = formatEnemyRatingHistogramRangeLines(bin)
      return {
        rank: bin.rating,
        stat: {
          range: range.join(' '),
          cumulativeRange: bin.upperBound === null ? '全範囲' : range[range.length - 1],
          count: bin.count,
          share: proportion,
          cumulativeShare: cumulativeProportion,
          cumulativeCount: cumulativeProportion === null ? null : cumulativeCount,
        },
      }
    })
    return { ranks, totals: { valid, missing } }
  }

  const defense = summarize('defense')
  const magicResistance = summarize('magicResistance')
  return {
    rows: defense.ranks.map(({ rank, stat }, index) => ({
      rank,
      stats: { defense: stat, magicResistance: magicResistance.ranks[index].stat },
    })),
    totals: { defense: defense.totals, magicResistance: magicResistance.totals },
    hasData: defense.totals.valid > 0 || magicResistance.totals.valid > 0,
  }
}

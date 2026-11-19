import type { EnemyRatingComparisonSideValue, EnemyRatingComparisonStat } from './enemyRatingComparison.ts'
import { formatHistogramPercentage } from './histogramPercentageLabels.ts'

export function getEnemyRatingVideoProgress(seconds: number, { start, duration }: { start: number; duration: number }): number {
  if (duration === 0) return Number(seconds >= start)
  const progress = Math.max(0, Math.min(1, (seconds - start) / duration))
  return progress * progress * (3 - 2 * progress)
}

export function getAnimatedEnemyRatingShares(
  rows: readonly Pick<EnemyRatingComparisonStat, 'share' | 'cumulativeShare'>[],
  progresses: readonly number[],
  sideValue: EnemyRatingComparisonSideValue,
): (number | null)[] {
  let cumulative = 0
  let completed = true
  return rows.map(({ share, cumulativeShare }, index) => {
    const progress = Math.max(0, Math.min(1, progresses[index] ?? 0))
    const portion = (share ?? 0) * progress
    cumulative += portion
    completed = completed && (progress === 1 || share === 0 || share === null)
    if (sideValue === 'rank') return share === null ? null : progress === 1 ? share : portion
    if (cumulativeShare === null) return null
    // Preserve the original completed value and contain rounding error at 100%.
    return completed ? cumulativeShare : Math.min(cumulativeShare, Math.max(0, cumulative))
  })
}

export function formatEnemyRatingVideoShare(share: number | null): string {
  if (share === null) return '—'
  return formatHistogramPercentage(share, 1)?.replace(/%$/, '').replace(/\.0$/, '') ?? '—'
}

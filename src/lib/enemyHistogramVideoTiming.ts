import {
  createChartVideoTimingDraft, getChartVideoTimingBounds, getEnemyRatingVideoBarStep, parseChartVideoTiming,
  type ChartVideoTiming, type ChartVideoTimingDefinition, type ChartVideoTimingDraft, type EnemyRatingVideoValueMode,
} from './enemyRatingVideoTiming.ts'
import { getEnemyRatingVideoProgress } from './enemyRatingVideoValues.ts'
import { buildHistogramCumulativeRows } from './histogramCumulative.ts'

export type EnemyHistogramVideoPhase = 'bars' | 'values'
export type EnemyHistogramVideoTiming = ChartVideoTiming<EnemyHistogramVideoPhase>
export type EnemyHistogramVideoTimingDraft = ChartVideoTimingDraft<EnemyHistogramVideoPhase>

export const ENEMY_HISTOGRAM_VIDEO_DEFINITION: ChartVideoTimingDefinition<EnemyHistogramVideoPhase> = {
  phases: ['bars', 'values'],
  weights: { bars: .68, values: .32 },
}

export function createEnemyHistogramVideoTimingDraft(): EnemyHistogramVideoTimingDraft {
  return { ...createChartVideoTimingDraft(ENEMY_HISTOGRAM_VIDEO_DEFINITION), barMode: 'staggerGrow', valueMode: 'linked' }
}

export function parseEnemyHistogramVideoTiming(draft: EnemyHistogramVideoTimingDraft) {
  return parseChartVideoTiming(draft, ENEMY_HISTOGRAM_VIDEO_DEFINITION)
}

export function setEnemyHistogramVideoValueMode(
  draft: EnemyHistogramVideoTimingDraft,
  valueMode: EnemyRatingVideoValueMode,
): EnemyHistogramVideoTimingDraft {
  const next = { ...draft, valueMode }
  const previous = parseEnemyHistogramVideoTiming(draft)
  const parsed = parseEnemyHistogramVideoTiming(next)
  if (!previous.timing || (parsed.timing && Math.abs(parsed.finish - previous.finish) < 1e-10)) return next
  next.finishSeconds = previous.finish > 0 ? String(previous.finish) : ''
  if (previous.finish === 0) {
    next.overrides = { ...draft.overrides, bars: '0', values: '0' }
  } else if (!parseEnemyHistogramVideoTiming(next).timing) {
    next.overrides = { ...draft.overrides }
    delete next.overrides.bars
    if (valueMode === 'fixed') delete next.overrides.values
  }
  return next
}

export function getEnemyHistogramVideoTimingBounds(timing: EnemyHistogramVideoTiming) {
  return getChartVideoTimingBounds(timing, ENEMY_HISTOGRAM_VIDEO_DEFINITION)
}

export function getEnemyHistogramVideoFrame(
  timing: EnemyHistogramVideoTiming,
  seconds: number,
  counts: readonly number[],
  total: number,
) {
  const { finish } = getEnemyHistogramVideoTimingBounds(timing)
  const complete = seconds >= finish
  const activeCount = counts.reduce((sum, count) => sum + Number(count > 0), 0)
  let activeIndex = 0
  const visible: boolean[] = []
  const progress = counts.map(count => {
    if (count === 0) {
      visible.push(complete || seconds >= timing.bars.start)
      return Number(complete)
    }
    const step = getEnemyRatingVideoBarStep(timing, activeIndex++, activeCount)
    visible.push(complete || seconds >= step.start)
    return complete ? 1 : getEnemyRatingVideoProgress(seconds, step)
  })
  const currentCounts = counts.map((count, index) => count * progress[index])
  const current = buildHistogramCumulativeRows(currentCounts.map(count => ({ count })), total)
  const linked = timing.valueMode === 'linked'
  const cumulative = linked ? current : buildHistogramCumulativeRows(counts.map(count => ({ count })), total)
  return {
    progress,
    counts: currentCounts,
    shares: current.map(row => row.proportion ?? 0),
    cumulativeShares: cumulative.map(row => row.cumulativeProportion ?? 0),
    cumulativeProgress: linked || complete ? 1 : getEnemyRatingVideoProgress(seconds, timing.values),
    visible,
  }
}

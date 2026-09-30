import type { SurtrDurationModel, SurtrDurationResult } from './surtrDuration.ts'

export interface SurtrDurationTimelineRow {
  time: number
  hp: number | null
  hpPercent: number | null
  status: 'activation' | 'full-heal' | 'drain' | 'remnant-start' | 'remnant' | 'retreated'
}

const MAX_TIMELINE_ROWS = 10_000

/**
 * Sample the model after events at each timestamp. HP is held between ticks,
 * never interpolated or rounded; the caller may round only its presentation.
 * Skill effect, Remnant, and retreat rows are retained at either display step.
 */
export function buildSurtrDurationTimeline(
  model: SurtrDurationModel,
  result: SurtrDurationResult,
  step: 1 | 5 = 1,
): SurtrDurationTimelineRow[] {
  if ((step !== 1 && step !== 5)
    || !nonNegative(model.activationDelay)
    || !nonNegative(result.remnantStart)
    || !nonNegative(result.retreatTime)
    || model.activationDelay > result.remnantStart
    || result.remnantStart > result.retreatTime
    || result.points.length === 0) return []

  const activationTime = cleanTime(model.activationDelay)
  const remnantTime = cleanTime(result.remnantStart)
  const retreatTime = cleanTime(result.retreatTime)
  const regularCount = Math.floor(retreatTime / step) + 1
  if (!Number.isSafeInteger(regularCount) || regularCount + 3 > MAX_TIMELINE_ROWS) return []

  // calculateSurtrDuration emits chronological points and can have two entries
  // at a shared timestamp. Keep their order so the final entry wins.
  const points = result.points
  if (points[0].time !== 0 || points.some((point, index) => (
    !nonNegative(point.time) || !nonNegative(point.hp) || !nonNegative(point.hpPercent)
    || point.hpPercent > 100 || (index > 0 && point.time < points[index - 1].time)
  ))) return []

  const times = new Set<number>([0, activationTime, remnantTime, retreatTime])
  for (let index = 0; index < regularCount; index += 1) times.add(index * step)
  let pointIndex = 0
  return [...times].sort((a, b) => a - b).map((time) => {
    // The model's endpoint still contains 1 HP. At expiry Surtr is absent,
    // rather than a present operator with either 1 or 0 HP.
    if (time >= retreatTime) return { time, hp: null, hpPercent: null, status: 'retreated' }
    while (pointIndex + 1 < points.length && cleanTime(points[pointIndex + 1].time) <= time) {
      pointIndex += 1
    }
    const { hp, hpPercent } = points[pointIndex]
    const status: SurtrDurationTimelineRow['status'] = time === remnantTime ? 'remnant-start'
      : time >= remnantTime ? 'remnant'
        : time === activationTime ? 'full-heal'
          : time < activationTime ? 'activation' : 'drain'
    return { time, hp, hpPercent, status }
  })
}

function nonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

/** Match the duration model's timestamp precision when merging event rows. */
function cleanTime(value: number): number {
  return Math.round(value * 1e9) / 1e9
}

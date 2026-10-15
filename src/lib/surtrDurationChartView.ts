export type SurtrDurationChartRange = 'remnant' | 'retreat'

export interface SurtrDurationChartViewPoint {
  time: number
  hpPercent: number
  phase?: string
}

export interface SurtrDurationChartViewSeries {
  remnantStart: number | null
  remnantDuration: number
  retreatTime: number | null
  endTime?: number
  points: readonly SurtrDurationChartViewPoint[]
}

export type PreparedSurtrDurationChartSeries<T extends SurtrDurationChartViewSeries> = Omit<T, 'points'> & {
  points: SurtrDurationChartViewPoint[]
  displayEnd: number
  triggerHp: number | null
}

/** Prepare drawing data without changing the calculation result or its event times. */
export function prepareSurtrDurationChartSeries<T extends SurtrDurationChartViewSeries>(
  series: readonly T[],
  range: SurtrDurationChartRange,
): PreparedSurtrDurationChartSeries<T>[] {
  return series.flatMap(item => {
    const endTime = item.endTime ?? item.retreatTime
    if (!(item.remnantStart === null || nonNegative(item.remnantStart))
      || !nonNegative(item.remnantDuration)
      || !(item.retreatTime === null || nonNegative(item.retreatTime)
        && item.retreatTime >= (item.remnantStart ?? 0))
      || !nonNegative(endTime)) return []

    const points = item.points.filter(point => nonNegative(point.time) && point.time <= endTime
      && Number.isFinite(point.hpPercent))
      .map(point => ({ ...point, hpPercent: Math.max(0, Math.min(100, point.hpPercent)) }))
      .sort((a, b) => a.time - b.time)
    const trigger = item.remnantStart !== null && item.remnantStart <= endTime ? item.remnantStart : null
    if (trigger === null) return [{ ...item, points, displayEnd: endTime, triggerHp: null }]

    // The combat model emits before/after points at the same time. The first
    // Remnant point is the lethal event, before any healing later in that tick.
    const phaseIndex = points.findIndex(point => point.time === trigger && point.phase === 'remnant')
    if (range === 'retreat') return [{ ...item, points, displayEnd: endTime,
      triggerHp: (phaseIndex >= 0 ? points[phaseIndex] : points.filter(point => point.time <= trigger).at(-1))?.hpPercent ?? null }]

    let triggerIndex = phaseIndex
    if (triggerIndex < 0) {
      // Legacy chart callers may omit phase. The trigger has a one-HP floor;
      // use its first lowest sample, before same-time recovery raises HP.
      for (let index = 0; index < points.length; index += 1) {
        if (points[index].time === trigger && (triggerIndex < 0
          || points[index].hpPercent < points[triggerIndex].hpPercent)) triggerIndex = index
      }
    }
    if (triggerIndex >= 0) return [{ ...item, points: points.slice(0, triggerIndex + 1),
      displayEnd: trigger, triggerHp: points[triggerIndex].hpPercent }]

    const before = points.filter(point => point.time < trigger)
    const lower = before.at(-1)
    const upper = points.find(point => point.time > trigger)
    // Unsampled legacy data follows the line already drawn between samples.
    // Never invent a zero-HP endpoint when no HP data exists.
    const triggerHp = lower && upper
      ? lower.hpPercent + (upper.hpPercent - lower.hpPercent) * (trigger - lower.time) / (upper.time - lower.time)
      : (lower ?? upper)?.hpPercent ?? null
    const endpoint = triggerHp === null ? [] : [{ time: trigger, hpPercent: triggerHp, phase: 'remnant' }]
    return [{ ...item, points: [...before, ...endpoint], displayEnd: trigger, triggerHp }]
  })
}

function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

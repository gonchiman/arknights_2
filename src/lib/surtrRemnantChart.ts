import {
  calculateSurtrRemnantAttacks,
  type SurtrRemnantAttackAssumptions,
  type SurtrRemnantAttackModel,
} from './surtrRemnantAttacks.ts'
import type { SurtrDpsLineStyle } from './surtrDpsOutput.ts'

export type SurtrRemnantChartKind = 'grouped-bar' | 'step' | 'bands'

/** Keep screen, preview and PNG on the same natural row heights. */
export function getSurtrRemnantAttackChartHeight(kind: SurtrRemnantChartKind, seriesCount: number): number {
  if (kind === 'step') return 26 + Math.max(1, seriesCount) * 160 + 30
  // Keep boundary CT and isolated endpoint labels between their own bands.
  return kind === 'bands' ? Math.max(334, 74 + Math.max(1, seriesCount) * 82) : 334
}

export interface SurtrRemnantChartSeries {
  id: string
  label: string
  color: string
  moduleId?: string
  level?: number
  lineStyle?: SurtrDpsLineStyle
  model: SurtrRemnantAttackModel
}

/** Stage line styles match the shared S3 plot; omitted styles retain solid lines. */
export function getSurtrRemnantLineDasharray(lineStyle?: SurtrDpsLineStyle): string | undefined {
  return lineStyle === 'dotted' ? '2 3' : lineStyle === 'dashed' ? '7 4' : undefined
}

export interface SurtrRemnantCountInterval {
  from: number
  to: number
  count: number
  includeFrom: boolean
  includeTo: boolean
}

export interface SurtrRemnantCountEndpoint {
  ct: number
  count: number
}

/**
 * Positive-width count ranges inside this model's own pre-activation CT range.
 * Boundaries are analytical, rather than rounded to the table's sample step.
 * Endpoint inclusion uses the calculator's same-time tolerance and retreat rule.
 * A count found only at CT zero or the upper limit is returned by the endpoint
 * helper, since a zero-width interval cannot be drawn as a line or a band.
 */
export function buildSurtrRemnantCountIntervals(
  model: SurtrRemnantAttackModel,
  assumptions: SurtrRemnantAttackAssumptions,
): SurtrRemnantCountInterval[] {
  const endpoints = buildSurtrRemnantCountEndpoints(model, assumptions)
  if (!endpoints.length) return []
  const limit = model.attackIntervalBefore
  // Match the calculator's clamp for a windup within its accepted 1 ns margin.
  const windup = Math.min(assumptions.windup, model.attackIntervalAfter)
  const maximumHits = Math.ceil(model.remnantDuration / model.attackIntervalAfter) + 1
  const boundaries = new Set([0, limit])
  for (let index = 0; index < maximumHits; index += 1) {
    const postActivationCt = model.remnantDuration - windup - index * model.attackIntervalAfter
    // Division before multiplication preserves ratio carry even if after/before
    // would underflow; windup belongs to the post-activation timeline.
    const ct = assumptions.ctCarry === 'ratio'
      ? postActivationCt / model.attackIntervalAfter * model.attackIntervalBefore
      : postActivationCt
    if (Number.isFinite(ct) && ct > 0 && ct < limit) boundaries.add(ct)
  }
  const ordered = [...boundaries].sort((a, b) => a - b)
  const counts = new Map(endpoints.map(({ ct, count }) => [ct, count]))
  const countAt = (ct: number): number | null => {
    const cached = counts.get(ct)
    if (cached !== undefined) return cached
    const result = calculateSurtrRemnantAttacks(model, ct, assumptions)
    if (!result) return null
    counts.set(ct, result.hitCount)
    return result.hitCount
  }
  const intervals: SurtrRemnantCountInterval[] = []
  for (let index = 1; index < ordered.length; index += 1) {
    const from = ordered[index - 1]
    const to = ordered[index]
    if (to <= from) continue
    const count = countAt(from + (to - from) / 2)
    const fromCount = countAt(from)
    const toCount = countAt(to)
    if (count === null || fromCount === null || toCount === null) return []
    const interval = { from, to, count, includeFrom: fromCount === count, includeTo: toCount === count }
    const previous = intervals.at(-1)
    if (previous && previous.count === count && previous.includeTo && interval.includeFrom) {
      previous.to = to
      previous.includeTo = interval.includeTo
    } else {
      intervals.push(interval)
    }
  }
  return intervals
}

/** Actual counts at both domain endpoints, including any isolated endpoint count. */
export function buildSurtrRemnantCountEndpoints(
  model: SurtrRemnantAttackModel,
  assumptions: SurtrRemnantAttackAssumptions,
): SurtrRemnantCountEndpoint[] {
  const first = calculateSurtrRemnantAttacks(model, 0, assumptions)
  if (!first) return []
  const last = calculateSurtrRemnantAttacks(model, model.attackIntervalBefore, assumptions)
  if (!last) return []
  return [{ ct: 0, count: first.hitCount }, { ct: model.attackIntervalBefore, count: last.hitCount }]
}

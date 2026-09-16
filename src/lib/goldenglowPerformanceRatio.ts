import type {
  GoldenglowPerformanceComparisonColumn,
  GoldenglowPerformanceComparisonValue,
} from './goldenglowPerformanceComparison.ts'

export type GoldenglowPerformanceRatioMode = 'ratio' | 'growth'

type DamageKey = Exclude<keyof GoldenglowPerformanceComparisonValue, 'resistance'>
const DAMAGE_KEYS: readonly DamageKey[] = [
  'expectedTotalDamage', 'expectedBodyDamage', 'expectedDroneNormalDamage', 'expectedExplosionDamage',
]
// Stay below the displayed 0.1 percentage point while keeping ordinary curves compact.
const CURVE_ERROR = 0.025
const MAX_SUBDIVISIONS = 1024
const MAX_DEPTH = 20

/** Sample raw damage first; a ratio of interpolated damage is not an interpolated ratio. */
export function buildGoldenglowPerformanceRatios(
  columns: readonly GoldenglowPerformanceComparisonColumn[],
  mode: GoldenglowPerformanceRatioMode,
  baselineId: string,
  resistances: readonly number[],
): GoldenglowPerformanceComparisonColumn[] {
  const baseline = sortedValues(columns.find((column) => column.build.id === baselineId)?.values ?? [])
  return columns.map((column) => {
    const evaluate = createEvaluator(sortedValues(column.values), baseline, mode)
    return { ...column, values: resistances.map((resistance) => evaluate.at(resistance)) }
  })
}

/** Preserve source breaks and gaps, refining only where percentage curves bend. */
export function buildGoldenglowPerformanceRatioCurve(
  columns: readonly GoldenglowPerformanceComparisonColumn[],
  mode: GoldenglowPerformanceRatioMode,
  baselineId: string,
): GoldenglowPerformanceComparisonColumn[] {
  const baseline = sortedValues(columns.find((column) => column.build.id === baselineId)?.values ?? [])
  return columns.map((column) => {
    const raw = sortedValues(column.values)
    const evaluate = createEvaluator(raw, baseline, mode)
    const knots = [...new Set([
      ...raw.map((value) => value.resistance),
      ...baseline.map((value) => value.resistance),
    ])].sort((a, b) => a - b)
    let subdivisions = 0

    const refine = (
      left: GoldenglowPerformanceComparisonValue,
      right: GoldenglowPerformanceComparisonValue,
      depth: number,
    ): GoldenglowPerformanceComparisonValue[] => {
      const leftDenominator = evaluate.denominator(left.resistance)
      const rightDenominator = evaluate.denominator(right.resistance)
      // On each raw interval every metric is linear / linear. Its largest chord
      // error occurs where the denominator is the geometric mean of its ends.
      const fraction = positive(leftDenominator) && positive(rightDenominator)
        ? Math.sqrt(leftDenominator) / (Math.sqrt(leftDenominator) + Math.sqrt(rightDenominator)) : 0.5
      const resistance = left.resistance + (right.resistance - left.resistance) * fraction
      if (resistance <= left.resistance || resistance >= right.resistance) return [left, right]
      const middle = evaluate.at(resistance)
      const unresolved = DAMAGE_KEYS.filter((key) => {
        const a = left[key]
        const b = right[key]
        const actual = middle[key]
        if (a === null || b === null) return actual !== null
        return actual === null || Math.abs(actual - (a * (1 - fraction) + b * fraction)) > CURVE_ERROR
      })
      if (unresolved.length === 0) return [left, right]
      if (depth >= MAX_DEPTH || subdivisions >= MAX_SUBDIVISIONS) {
        // Singular or extreme inputs must not yield a misleading chord after
        // the refinement budget is exhausted. Leave the unresolved span open.
        const gap = { ...middle }
        for (const key of unresolved) gap[key] = null
        return [left, gap, right]
      }
      subdivisions += 1
      const first = refine(left, middle, depth + 1)
      return [...first.slice(0, -1), ...refine(middle, right, depth + 1)]
    }

    const values: GoldenglowPerformanceComparisonValue[] = []
    for (let index = 0; index < knots.length; index += 1) {
      const current = evaluate.at(knots[index])
      if (index === 0) values.push(current)
      else values.push(...refine(values[values.length - 1], current, 0).slice(1))
    }
    return { ...column, values }
  })
}

function createEvaluator(
  values: readonly GoldenglowPerformanceComparisonValue[],
  baseline: readonly GoldenglowPerformanceComparisonValue[],
  mode: GoldenglowPerformanceRatioMode,
) {
  const denominator = (resistance: number) => interpolate(baseline, resistance, 'expectedTotalDamage')
  const at = (resistance: number): GoldenglowPerformanceComparisonValue => {
    const divisor = denominator(resistance)
    const metric = (key: DamageKey): number | null => {
      const numerator = interpolate(values, resistance, key)
      if (numerator === null || !positive(divisor)) return null
      let result: number
      if (mode === 'growth') {
        const reference = interpolate(baseline, resistance, key)
        if (reference === null) return null
        result = key === 'expectedTotalDamage'
          ? (numerator / divisor - 1) * 100 : (numerator - reference) / divisor * 100
      } else result = numerator / divisor * 100
      return Number.isFinite(result) ? result === 0 ? 0 : result : null
    }
    return {
      resistance,
      expectedTotalDamage: metric('expectedTotalDamage'),
      expectedBodyDamage: metric('expectedBodyDamage'),
      expectedDroneNormalDamage: metric('expectedDroneNormalDamage'),
      expectedExplosionDamage: metric('expectedExplosionDamage'),
    }
  }
  return { at, denominator }
}

function sortedValues(values: readonly GoldenglowPerformanceComparisonValue[]) {
  return values.filter((row) => Number.isFinite(row.resistance)).sort((a, b) => a.resistance - b.resistance)
}

function interpolate(values: readonly GoldenglowPerformanceComparisonValue[], resistance: number, key: DamageKey): number | null {
  if (!Number.isFinite(resistance)) return null
  let start = 0
  let end = values.length
  while (start < end) {
    const middle = Math.floor((start + end) / 2)
    if (values[middle].resistance < resistance) start = middle + 1
    else end = middle
  }
  const upper = values[start]
  const high = upper?.[key]
  if (!nonNegative(high)) return null
  if (upper.resistance === resistance) return high
  const lower = values[start - 1]
  const low = lower?.[key]
  // Do not extrapolate or skip an invalid row to bridge a missing segment.
  if (!nonNegative(low)) return null
  const weight = (resistance - lower.resistance) / (upper.resistance - lower.resistance)
  const result = low * (1 - weight) + high * weight
  return nonNegative(result) ? result : null
}

function nonNegative(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function positive(value: number | null | undefined): value is number {
  return nonNegative(value) && value > 0
}

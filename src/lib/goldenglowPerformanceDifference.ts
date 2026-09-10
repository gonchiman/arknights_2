import type {
  GoldenglowPerformanceComparisonColumn,
  GoldenglowPerformanceComparisonValue,
} from './goldenglowPerformanceComparison.ts'

type DamageKey = Exclude<keyof GoldenglowPerformanceComparisonValue, 'resistance'>

/** Matches only existing resistance rows; tables and single-resistance charts do not interpolate. */
export function buildGoldenglowPerformanceDifferences(
  columns: readonly GoldenglowPerformanceComparisonColumn[],
  baselineId: string,
): GoldenglowPerformanceComparisonColumn[] {
  const baseline = columns.find((column) => column.build.id === baselineId)
  if (!baseline) return []
  const baselineValues = new Map(baseline.values.map((value) => [value.resistance, value]))

  return columns.map((column) => ({
    ...column,
    values: column.values.map((value) => {
      const baselineValue = Number.isFinite(value.resistance) ? baselineValues.get(value.resistance) : undefined
      const difference = (key: DamageKey): number | null => {
        const current = value[key]
        const reference = baselineValue?.[key]
        if (!isFiniteValue(current) || !isFiniteValue(reference)) return null
        const result = current - reference
        return Number.isFinite(result) ? result === 0 ? 0 : result : null
      }
      return {
        resistance: value.resistance,
        expectedTotalDamage: difference('expectedTotalDamage'),
        expectedBodyDamage: difference('expectedBodyDamage'),
        expectedDroneNormalDamage: difference('expectedDroneNormalDamage'),
        expectedExplosionDamage: difference('expectedExplosionDamage'),
      }
    }),
  }))
}

/** Subtracts a baseline without changing the source calculations or rounding their values. */
export function buildGoldenglowPerformanceDifferenceCurve(
  columns: readonly GoldenglowPerformanceComparisonColumn[],
  baselineId: string,
): GoldenglowPerformanceComparisonColumn[] {
  const baseline = columns.find((column) => column.build.id === baselineId)
  if (!baseline) return []
  const baselineValues = sortedCurveValues(baseline.values)

  return columns.map((column) => {
    const values = sortedCurveValues(column.values)
    // Both curves can change slope at different resistance values.
    const resistances = [...new Set([...values, ...baselineValues].map((row) => row.resistance))]
      .sort((a, b) => a - b)
    return {
      ...column,
      values: resistances.map((resistance) => {
        const difference = (key: DamageKey): number | null => {
          const value = interpolateCurveValue(values, resistance, key)
          const baselineValue = interpolateCurveValue(baselineValues, resistance, key)
          if (value === null || baselineValue === null) return null
          const result = value - baselineValue
          return Number.isFinite(result) ? result === 0 ? 0 : result : null
        }
        return {
          resistance,
          expectedTotalDamage: difference('expectedTotalDamage'),
          expectedBodyDamage: difference('expectedBodyDamage'),
          expectedDroneNormalDamage: difference('expectedDroneNormalDamage'),
          expectedExplosionDamage: difference('expectedExplosionDamage'),
        }
      }),
    }
  })
}

function sortedCurveValues(values: readonly GoldenglowPerformanceComparisonValue[]): GoldenglowPerformanceComparisonValue[] {
  return values.filter((row) => Number.isFinite(row.resistance)).sort((a, b) => a.resistance - b.resistance)
}

function interpolateCurveValue(
  values: readonly GoldenglowPerformanceComparisonValue[],
  resistance: number,
  key: DamageKey,
): number | null {
  const upperIndex = values.findIndex((row) => row.resistance >= resistance)
  const upper = values[upperIndex]
  const upperValue = upper?.[key]
  if (!isFiniteValue(upperValue)) return null
  if (upper.resistance === resistance) return upperValue

  const lower = values[upperIndex - 1]
  const lowerValue = lower?.[key]
  // Never extrapolate, or skip a missing point to interpolate across a gap.
  if (!isFiniteValue(lowerValue)) return null
  const weight = (resistance - lower.resistance) / (upper.resistance - lower.resistance)
  const result = lowerValue + (upperValue - lowerValue) * weight
  return Number.isFinite(result) ? result : null
}

function isFiniteValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

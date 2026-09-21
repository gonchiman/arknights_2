import type { EmpiricalCdfPoint } from './enemyStatistics.ts'

export interface EcdfGuideValues {
  x: number | null
  yPercent: number | null
}

export interface EcdfGuideInput {
  value: number | null
  error: string | null
}

export interface EcdfXGuideReading {
  value: number
  cumulativeCount: number
  proportion: number
  inRange: boolean
}

export interface EcdfYGuideReading {
  percentage: number
  value: number | null
  proportion: number
  cumulativeCount: number
}

export interface EcdfGuideReadings {
  x: EcdfXGuideReading | null
  y: EcdfYGuideReading | null
}

export function parseEcdfGuideInput(input: string, axis: 'x' | 'y'): EcdfGuideInput {
  if (input.trim() === '') return { value: null, error: null }

  const value = Number(input)
  if (!isValidGuideValue(value, axis)) {
    return {
      value: null,
      error: axis === 'x' ? '0以上の数値を入力してください。' : '0〜100の数値を入力してください。',
    }
  }

  return { value: value === 0 ? 0 : value, error: null }
}

export function calculateEcdfGuideReadings(
  points: ReadonlyArray<EmpiricalCdfPoint>,
  guides: EcdfGuideValues,
): EcdfGuideReadings {
  if (points.length === 0) return { x: null, y: null }

  let x: EcdfXGuideReading | null = null
  let y: EcdfYGuideReading | null = null

  if (isValidGuideValue(guides.x, 'x')) {
    const value = guides.x
    // Find the last observed value at or below the selected value, including ties.
    const nextIndex = findFirstPointIndex(points, (point) => point.value > value)
    const point = nextIndex > 0 ? points[nextIndex - 1] : null
    x = {
      value,
      cumulativeCount: point?.cumulativeCount ?? 0,
      proportion: point?.proportion ?? 0,
      inRange: value >= points[0].value && value <= points[points.length - 1].value,
    }
  }

  if (isValidGuideValue(guides.yPercent, 'y')) {
    const percentage = guides.yPercent
    if (percentage === 0) {
      y = { percentage, value: null, proportion: 0, cumulativeCount: 0 }
    } else {
      const targetProportion = percentage / 100
      const point = points[findFirstPointIndex(points, (item) => item.proportion >= targetProportion)]
      if (point) {
        y = {
          percentage,
          value: point.value,
          proportion: point.proportion,
          cumulativeCount: point.cumulativeCount,
        }
      }
    }
  }

  return { x, y }
}

function isValidGuideValue(value: number | null, axis: 'x' | 'y'): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && (axis === 'x' || value <= 100)
}

function findFirstPointIndex(
  points: ReadonlyArray<EmpiricalCdfPoint>,
  predicate: (point: EmpiricalCdfPoint) => boolean,
): number {
  let lower = 0
  let upper = points.length

  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2)
    if (predicate(points[middle])) upper = middle
    else lower = middle + 1
  }

  return lower
}

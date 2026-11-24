export interface NormalQqPlot {
  points: { theoretical: number; observed: number }[]
  reference: { slope: number; intercept: number } | null
}

// Coefficients for Peter J. Acklam's piecewise rational approximation to Φ⁻¹.
const CENTRAL_NUMERATOR = [
  -39.69683028665376, 220.9460984245205, -275.9285104469687,
  138.3577518672690, -30.66479806614716, 2.506628277459239,
]
const CENTRAL_DENOMINATOR = [
  -54.47609879822406, 161.5858368580409, -155.6989798598866,
  66.80131188771972, -13.28068155288572, 1,
]
const TAIL_NUMERATOR = [
  -0.007784894002430293, -0.3223964580411365, -2.400758277161838,
  -2.549732539343734, 4.374664141464968, 2.938163982698783,
]
const TAIL_DENOMINATOR = [
  0.007784695709041462, 0.3224671290700398, 2.445134137142996,
  3.754408661907416, 1,
]

function polynomial(coefficients: readonly number[], x: number): number {
  return coefficients.reduce((value, coefficient) => value * x + coefficient, 0)
}

function standardNormalQuantile(probability: number): number {
  const tailProbability = Math.min(probability, 1 - probability)
  if (tailProbability < 0.02425) {
    const x = Math.sqrt(-2 * Math.log(tailProbability))
    const lowerQuantile = polynomial(TAIL_NUMERATOR, x) / polynomial(TAIL_DENOMINATOR, x)
    return probability < 0.5 ? lowerQuantile : -lowerQuantile
  }
  const centered = probability - 0.5
  const squared = centered * centered
  return centered * polynomial(CENTRAL_NUMERATOR, squared) / polynomial(CENTRAL_DENOMINATOR, squared)
}

/** Pair each ordered observation with the midpoint of its rank in a normal sample. */
export function calculateNormalQqPlot(
  values: readonly number[],
  firstQuartile: number | null,
  thirdQuartile: number | null,
): NormalQqPlot {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  const points = sorted.map((observed, index) => ({
    theoretical: standardNormalQuantile((index + 0.5) / sorted.length),
    observed,
  }))
  if (points.length < 2 || firstQuartile === null || thirdQuartile === null ||
      !Number.isFinite(firstQuartile) || !Number.isFinite(thirdQuartile) || thirdQuartile <= firstQuartile) {
    return { points, reference: null }
  }

  // The normal quartiles are symmetric around zero, so the midpoint is the intercept.
  const normalUpperQuartile = 0.6744897501960817
  const slope = (thirdQuartile / 2 - firstQuartile / 2) / normalUpperQuartile
  const intercept = firstQuartile / 2 + thirdQuartile / 2
  return { points, reference: Number.isFinite(slope) ? { slope, intercept } : null }
}

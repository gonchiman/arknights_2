/** Pearson's r for aligned, equally weighted observations. Missing pairs must be
 * removed by the caller; invalid arrays and undefined correlations return null.
 */
export function calculatePearsonCorrelation(
  x: readonly number[], y: readonly number[],
): number | null {
  if (x.length !== y.length || x.length < 2) return null
  if (!x.every(Number.isFinite) || !y.every(Number.isFinite)) return null
  const centeredX = centeredUnitValues(x)
  const centeredY = centeredUnitValues(y)
  if (!centeredX || !centeredY) return null
  const xVariation = compensatedSum(centeredX.map(value => value * value))
  const yVariation = compensatedSum(centeredY.map(value => value * value))
  if (!(xVariation > 0) || !(yVariation > 0)) return null
  const covariance = compensatedSum(centeredX.map((value, index) => value * centeredY[index]))
  const result = covariance / Math.sqrt(xVariation) / Math.sqrt(yVariation)
  return Number.isFinite(result) ? Math.max(-1, Math.min(1, result)) : null
}

function centeredUnitValues(values: readonly number[]): number[] | null {
  // Shifting first preserves close representable values at a large baseline.
  // Opposite extreme signs can overflow that subtraction; normalize first then.
  let offsets = values.map(value => value - values[0])
  if (!offsets.every(Number.isFinite)) {
    const scale = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0)
    const origin = values[0] / scale
    offsets = values.map(value => value / scale - origin)
  }
  const scale = offsets.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0)
  if (!(scale > 0)) return null
  const normalized = offsets.map(value => value / scale)
  const mean = compensatedSum(normalized) / normalized.length
  return normalized.map(value => value - mean)
}

function compensatedSum(values: readonly number[]): number {
  let result = 0
  let correction = 0
  for (const value of values) {
    const corrected = value - correction
    const next = result + corrected
    correction = (next - result) - corrected
    result = next
  }
  return result
}

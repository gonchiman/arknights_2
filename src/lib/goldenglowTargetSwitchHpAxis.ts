export type HpChartYAxisMode = 'zero' | 'auto' | 'manual'

export interface HpChartYAxisRange {
  min: number
  max: number
}

export interface HpChartValueAxis {
  lowerLimit: number
  upperLimit: number
  valueStep: number
  yTicks: number[]
}

interface HpChartValueAxisOptions {
  mode?: HpChartYAxisMode
  nonNegative?: boolean
  composition?: boolean
  manualRange?: HpChartYAxisRange
}

export function isValidHpChartYAxisRange(range: HpChartYAxisRange | undefined): range is HpChartYAxisRange {
  return !!range && Number.isFinite(range.min) && Number.isFinite(range.max)
    && range.min < range.max && Number.isFinite(range.max - range.min)
}

/** Automatic modes fit finite values; manual bounds are exact and composition retains its percentage scale. */
export function getHpChartValueAxis(
  values: readonly number[],
  { mode = 'zero', nonNegative = false, composition = false, manualRange }: HpChartValueAxisOptions = {},
): HpChartValueAxis {
  if (composition) return createAxis(0, 100, 25)
  if (mode === 'manual' && isValidHpChartYAxisRange(manualRange)) return createManualAxis(manualRange)

  let minimum = Infinity
  let maximum = -Infinity
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    minimum = Math.min(minimum, value)
    maximum = Math.max(maximum, value)
  }
  if (minimum === Infinity || (minimum === 0 && maximum === 0)) return createAxis(0, 1, 1)

  if (mode === 'zero') {
    minimum = Math.min(0, minimum)
    maximum = Math.max(0, maximum)
    const valueStep = niceStep((maximum - minimum) / 4)
    return createAxis(
      Math.floor(minimum / valueStep) * valueStep,
      Math.ceil(maximum / valueStep) * valueStep,
      valueStep,
    )
  }

  // A constant series needs a visible range, including when its value is negative.
  const span = maximum - minimum
  const padding = Math.max(
    (span > 0 ? span : Math.abs(maximum)) * 0.05,
    Math.max(Math.abs(minimum), Math.abs(maximum)) * Number.EPSILON * 4,
  )
  const paddedMinimum = nonNegative && minimum >= 0 ? Math.max(0, minimum - padding) : minimum - padding
  const paddedMaximum = maximum + padding
  const valueStep = niceStep((paddedMaximum - paddedMinimum) / 6)
  return createAxis(
    Math.floor(paddedMinimum / valueStep) * valueStep,
    Math.ceil(paddedMaximum / valueStep) * valueStep,
    valueStep,
  )
}

function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const power = Math.max(Number.MIN_VALUE, 10 ** Math.floor(Math.log10(value)))
  const factor = value / power
  return (factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10) * power
}

function createManualAxis({ min: lowerLimit, max: upperLimit }: HpChartYAxisRange): HpChartValueAxis {
  const valueStep = niceStep(Math.max(Number.MIN_VALUE, (upperLimit - lowerLimit) / 6))
  const yTicks = [lowerLimit]
  const firstTickIndex = Math.ceil(lowerLimit / valueStep)
  const endpointSpacing = valueStep * 0.4
  // At extreme magnitudes an adjacent integer tick index may not be representable.
  // Endpoints still define the requested range, and a fixed loop keeps work bounded.
  if (Number.isSafeInteger(firstTickIndex)) {
    for (let offset = 0; offset < 8; offset += 1) {
      const tick = (firstTickIndex + offset) * valueStep
      if (tick >= upperLimit) break
      if (tick - lowerLimit < endpointSpacing || upperLimit - tick < endpointSpacing) continue
      if (Number.isFinite(tick) && tick > yTicks.at(-1)!) yTicks.push(tick === 0 ? 0 : tick)
    }
  }
  yTicks.push(upperLimit)
  return { lowerLimit, upperLimit, valueStep, yTicks }
}

function createAxis(lowerLimit: number, upperLimit: number, valueStep: number): HpChartValueAxis {
  const tickCount = Math.round((upperLimit - lowerLimit) / valueStep) + 1
  const yTicks = Array.from({ length: tickCount }, (_, index) => {
    const tick = lowerLimit + index * valueStep
    return Math.abs(tick) < valueStep * 1e-8 ? 0 : tick
  })
  return { lowerLimit, upperLimit, valueStep, yTicks }
}

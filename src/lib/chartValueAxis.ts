export interface ZeroBasedValueAxis {
  maximum: number
  step: number
  ticks: number[]
}

/** Use the distribution comparison's 1/2/5 steps, keeping count ticks integral by default. */
export function createZeroBasedValueAxis(maximum: number, minimumStep = 1): ZeroBasedValueAxis {
  const validMaximum = Number.isFinite(maximum) ? Math.max(0, maximum) : 0
  const validMinimumStep = Number.isFinite(minimumStep) && minimumStep >= 0 ? minimumStep : 1
  const step = niceStep(validMaximum / 4, validMinimumStep)
  const roundedMaximum = Math.ceil(validMaximum / step) * step
  const axisMaximum = Math.max(step, Number.isFinite(roundedMaximum) ? roundedMaximum : validMaximum)
  const ticks = Array.from({ length: Math.round(axisMaximum / step) + 1 }, (_, index) => index * step)
    .filter(tick => Number.isFinite(tick) && tick <= axisMaximum)
  if (ticks.at(-1) !== axisMaximum) ticks.push(axisMaximum)
  return { maximum: axisMaximum, step, ticks }
}

function niceStep(raw: number, minimum: number): number {
  if (raw <= 0 || !Number.isFinite(raw)) return minimum || 1
  const magnitude = Math.max(Number.MIN_VALUE, 10 ** Math.floor(Math.log10(raw)))
  const normalized = raw / magnitude
  return Math.max(minimum, (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude)
}

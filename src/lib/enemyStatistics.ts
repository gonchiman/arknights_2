export interface HistogramBin {
  start: number
  end: number
  count: number
  includesMaximum: boolean
  isOverflow?: boolean
}

export type HistogramScale = 'LINEAR' | 'LOG'

export interface HistogramMetadata {
  scale: HistogramScale
  binWidth: number | null
  normalRangeStart: number
  normalRangeEnd: number
  normalBinCount: number
  hasOverflow: boolean
}

export type CustomLinearBinWidthValidationError = 'INVALID' | 'TOO_MANY_BINS'

export interface CustomLinearBinWidthValidation {
  valid: boolean
  binCount: number | null
  error: CustomLinearBinWidthValidationError | null
}

export interface NumericStatistics {
  totalCount: number
  count: number
  missingCount: number
  minimum: number | null
  firstQuartile: number | null
  median: number | null
  mean: number | null
  thirdQuartile: number | null
  maximum: number | null
  standardDeviation: number | null
  bins: HistogramBin[]
  histogram: HistogramMetadata | null
}

export interface NumericStatisticsWithDispersion extends NumericStatistics {
  coefficientOfVariation: number | null
  interquartileRange: number | null
  normalizedInterquartileRange: number | null
}

export interface EmpiricalCdfPoint {
  value: number
  count: number
  cumulativeCount: number
  proportion: number
}

export interface BoxPlotStatistics {
  count: number
  minimum: number
  firstQuartile: number
  median: number
  thirdQuartile: number
  maximum: number
  lowerWhisker: number
  upperWhisker: number
  outliers: number[]
}

const DEFAULT_BIN_COUNT = 10
const MAX_BIN_COUNT = 14
const LINEAR_NORMAL_BIN_COUNT = 10
const LINEAR_PERCENTILE = 0.95
const NICE_WIDTH_FACTORS = [1, 2, 2.5, 5, 10] as const

export const MAX_CUSTOM_LINEAR_BIN_COUNT = 200

export function calculateNumericStatistics(
  source: ReadonlyArray<number | null | undefined>,
  preferredBinCount = DEFAULT_BIN_COUNT,
  histogramScale: HistogramScale = 'LINEAR',
  minimumLinearBinWidth = 0,
  customLinearBinWidth: number | null = null,
  customLinearUpperBound: number | null = null,
): NumericStatistics {
  const values = getFiniteSortedValues(source)
  const count = values.length
  const totalCount = source.length

  if (count === 0) {
    const histogram = histogramScale === 'LINEAR'
      ? buildFixedUpperBoundLinearHistogram(values, minimumLinearBinWidth, customLinearBinWidth, customLinearUpperBound)
      : null
    return {
      totalCount,
      count,
      missingCount: totalCount,
      minimum: null,
      firstQuartile: null,
      median: null,
      mean: null,
      thirdQuartile: null,
      maximum: null,
      standardDeviation: null,
      bins: histogram?.bins ?? [],
      histogram: histogram?.metadata ?? null,
    }
  }

  const minimum = values[0]
  const maximum = values[count - 1]
  const mean = values.reduce((sum, value) => sum + value, 0) / count
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / count
  const histogram = buildHistogram(
    values,
    preferredBinCount,
    histogramScale,
    minimumLinearBinWidth,
    customLinearBinWidth,
    customLinearUpperBound,
  )

  return {
    totalCount,
    count,
    missingCount: totalCount - count,
    minimum,
    firstQuartile: quantile(values, 0.25),
    median: quantile(values, 0.5),
    mean,
    thirdQuartile: quantile(values, 0.75),
    maximum,
    standardDeviation: Math.sqrt(variance),
    bins: histogram.bins,
    histogram: histogram.metadata,
  }
}

export function calculateNumericStatisticsWithDispersion(
  source: ReadonlyArray<number | null | undefined>,
  preferredBinCount = DEFAULT_BIN_COUNT,
  histogramScale: HistogramScale = 'LINEAR',
  minimumLinearBinWidth = 0,
  customLinearBinWidth: number | null = null,
  customLinearUpperBound: number | null = null,
): NumericStatisticsWithDispersion {
  const statistics = calculateNumericStatistics(
    source,
    preferredBinCount,
    histogramScale,
    minimumLinearBinWidth,
    customLinearBinWidth,
    customLinearUpperBound,
  )
  const interquartileRange = statistics.firstQuartile === null || statistics.thirdQuartile === null
    ? null
    : statistics.thirdQuartile - statistics.firstQuartile
  const supportsRelativeDispersion = statistics.minimum !== null && statistics.minimum >= 0

  return {
    ...statistics,
    coefficientOfVariation: supportsRelativeDispersion
      ? divideByPositiveFiniteValue(statistics.standardDeviation, statistics.mean)
      : null,
    interquartileRange,
    normalizedInterquartileRange: supportsRelativeDispersion
      ? divideByPositiveFiniteValue(interquartileRange, statistics.median)
      : null,
  }
}

function divideByPositiveFiniteValue(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (
    numerator === null
    || denominator === null
    || !Number.isFinite(numerator)
    || !Number.isFinite(denominator)
    || denominator <= 0
  ) {
    return null
  }

  const ratio = numerator / denominator
  return Number.isFinite(ratio) ? ratio : null
}

export function getCustomLinearHistogramMaximum(
  source: ReadonlyArray<number | null | undefined>,
  minimumLinearBinWidth = 0,
): number | null {
  const values = getFiniteSortedValues(source)
  if (values.length === 0 || values[0] < 0) return null

  const range = getAdaptiveLinearHistogramRange(values, minimumLinearBinWidth)
  return range.hasOverflow ? range.normalRangeEnd : values[values.length - 1]
}

export function validateCustomLinearBinWidth(
  value: number | null | undefined,
  maximum: number | null | undefined,
): CustomLinearBinWidthValidation {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value <= 0
    || typeof maximum !== 'number'
    || !Number.isFinite(maximum)
    || maximum < 0
  ) {
    return { valid: false, binCount: null, error: 'INVALID' }
  }

  const rawBinCount = maximum / value
  const nearestInteger = Math.round(rawBinCount)
  const integerTolerance = Number.EPSILON * Math.max(1, Math.abs(rawBinCount)) * 8
  const binCount = Math.max(
    1,
    Math.abs(rawBinCount - nearestInteger) <= integerTolerance
      ? nearestInteger
      : Math.ceil(rawBinCount),
  )
  if (!Number.isSafeInteger(binCount) || binCount > MAX_CUSTOM_LINEAR_BIN_COUNT) {
    return { valid: false, binCount, error: 'TOO_MANY_BINS' }
  }

  return { valid: true, binCount, error: null }
}

export function calculateEmpiricalCdf(
  source: ReadonlyArray<number | null | undefined>,
): EmpiricalCdfPoint[] {
  const values = getFiniteSortedValues(source)
  if (values.length === 0) return []

  const points: EmpiricalCdfPoint[] = []
  let cumulativeCount = 0

  for (let index = 0; index < values.length;) {
    const value = values[index]
    let nextIndex = index + 1
    while (nextIndex < values.length && values[nextIndex] === value) nextIndex += 1

    const count = nextIndex - index
    cumulativeCount += count
    points.push({
      value,
      count,
      cumulativeCount,
      proportion: cumulativeCount / values.length,
    })
    index = nextIndex
  }

  return points
}

export function calculateBoxPlotStatistics(
  source: ReadonlyArray<number | null | undefined>,
): BoxPlotStatistics | null {
  const values = getFiniteSortedValues(source)
  if (values.length === 0) return null

  const firstQuartile = quantile(values, 0.25)
  const median = quantile(values, 0.5)
  const thirdQuartile = quantile(values, 0.75)
  const interquartileRange = thirdQuartile - firstQuartile
  const lowerFence = firstQuartile - (1.5 * interquartileRange)
  const upperFence = thirdQuartile + (1.5 * interquartileRange)
  const lowerWhisker = values.find((value) => value >= lowerFence) ?? values[0]
  const upperWhisker = [...values].reverse().find((value) => value <= upperFence) ?? values[values.length - 1]

  return {
    count: values.length,
    minimum: values[0],
    firstQuartile,
    median,
    thirdQuartile,
    maximum: values[values.length - 1],
    lowerWhisker,
    upperWhisker,
    outliers: values.filter((value) => value < lowerWhisker || value > upperWhisker),
  }
}

function quantile(sortedValues: ReadonlyArray<number>, percentile: number): number {
  const position = (sortedValues.length - 1) * percentile
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lower = sortedValues[lowerIndex]
  const upper = sortedValues[upperIndex]
  return lower + ((upper - lower) * (position - lowerIndex))
}

function getFiniteSortedValues(
  source: ReadonlyArray<number | null | undefined>,
): number[] {
  return source
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b)
}

function buildHistogram(
  sortedValues: ReadonlyArray<number>,
  preferredBinCount: number,
  histogramScale: HistogramScale,
  minimumLinearBinWidth: number,
  customLinearBinWidth: number | null,
  customLinearUpperBound: number | null,
): { bins: HistogramBin[]; metadata: HistogramMetadata } {
  const minimum = sortedValues[0]
  const maximum = sortedValues[sortedValues.length - 1]

  if (histogramScale === 'LINEAR' && minimum >= 0) {
    if (customLinearUpperBound !== null) {
      return buildFixedUpperBoundLinearHistogram(
        sortedValues,
        minimumLinearBinWidth,
        customLinearBinWidth,
        customLinearUpperBound,
      ) ?? buildAdaptiveLinearHistogram(sortedValues, minimumLinearBinWidth)
    }
    const range = getAdaptiveLinearHistogramRange(sortedValues, minimumLinearBinWidth)
    const validation = validateCustomLinearBinWidth(
      customLinearBinWidth,
      range.hasOverflow ? range.normalRangeEnd : maximum,
    )
    if (validation.valid && validation.binCount !== null && customLinearBinWidth !== null) {
      return buildCustomLinearHistogram(
        sortedValues,
        customLinearBinWidth,
        validation.binCount,
        range.hasOverflow ? range.normalRangeEnd : null,
        range.boundaryTolerance,
      )
    }
    return buildAdaptiveLinearHistogram(sortedValues, minimumLinearBinWidth)
  }

  if (minimum === maximum) {
    return {
      bins: [{ start: minimum, end: maximum, count: sortedValues.length, includesMaximum: true }],
      metadata: {
        scale: histogramScale === 'LOG' && minimum >= 0 ? 'LOG' : 'LINEAR',
        binWidth: null,
        normalRangeStart: minimum,
        normalRangeEnd: maximum,
        normalBinCount: 1,
        hasOverflow: false,
      },
    }
  }

  const requestedBinCount = Number.isFinite(preferredBinCount) ? Math.round(preferredBinCount) : DEFAULT_BIN_COUNT
  const binCount = Math.min(MAX_BIN_COUNT, sortedValues.length, Math.max(1, requestedBinCount))
  const useLogScale = histogramScale === 'LOG' && minimum >= 0
  const transform = (value: number) => useLogScale ? Math.log1p(value) : value
  const inverse = (value: number) => useLogScale ? Math.expm1(value) : value
  const transformedMinimum = transform(minimum)
  const transformedMaximum = transform(maximum)
  const binWidth = (transformedMaximum - transformedMinimum) / binCount
  const bins = Array.from({ length: binCount }, (_, index): HistogramBin => ({
    start: index === 0 ? minimum : inverse(transformedMinimum + (binWidth * index)),
    end: index === binCount - 1 ? maximum : inverse(transformedMinimum + (binWidth * (index + 1))),
    count: 0,
    includesMaximum: index === binCount - 1,
  }))

  for (const value of sortedValues) {
    const index = value === maximum
      ? binCount - 1
      : Math.min(binCount - 1, Math.floor((transform(value) - transformedMinimum) / binWidth))
    bins[index].count += 1
  }

  return {
    bins,
    metadata: {
      scale: useLogScale ? 'LOG' : 'LINEAR',
      binWidth: useLogScale ? null : binWidth,
      normalRangeStart: minimum,
      normalRangeEnd: maximum,
      normalBinCount: bins.length,
      hasOverflow: false,
    },
  }
}

function buildFixedUpperBoundLinearHistogram(
  sortedValues: ReadonlyArray<number>,
  minimumLinearBinWidth: number,
  customLinearBinWidth: number | null,
  upperBound: number | null,
): { bins: HistogramBin[]; metadata: HistogramMetadata } | null {
  if (upperBound === null || !Number.isFinite(upperBound) || upperBound <= 0) return null

  const emptyBinWidth = Number.isFinite(minimumLinearBinWidth) && minimumLinearBinWidth > 0
    ? minimumLinearBinWidth
    : 1
  const binWidth = customLinearBinWidth ?? (sortedValues.length > 0
    ? getAdaptiveLinearHistogramRange(sortedValues, minimumLinearBinWidth).binWidth
    : emptyBinWidth)
  if (!Number.isFinite(upperBound + binWidth)) return null
  const validation = validateCustomLinearBinWidth(binWidth, upperBound)
  if (!validation.valid || validation.binCount === null) return null

  return buildCustomLinearHistogram(sortedValues, binWidth, validation.binCount, upperBound, 0, true)
}

function buildCustomLinearHistogram(
  sortedValues: ReadonlyArray<number>,
  binWidth: number,
  binCount: number,
  overflowThreshold: number | null,
  overflowTolerance: number,
  keepEmptyOverflow = false,
): { bins: HistogramBin[]; metadata: HistogramMetadata } {
  const normalRangeEnd = overflowThreshold ?? normalizeNumber(binWidth * binCount)
  const bins = Array.from({ length: binCount }, (_, index): HistogramBin => ({
    start: normalizeNumber(binWidth * index),
    end: index === binCount - 1 ? normalRangeEnd : normalizeNumber(binWidth * (index + 1)),
    count: 0,
    includesMaximum: index === binCount - 1,
  }))
  const boundaryTolerance = Number.EPSILON
    * Math.max(keepEmptyOverflow ? 0 : 1, Math.abs(binWidth), Math.abs(normalRangeEnd))
    * 8
  let overflowCount = 0

  for (const value of sortedValues) {
    if (overflowThreshold !== null && value > overflowThreshold + overflowTolerance) {
      overflowCount += 1
      continue
    }

    const index = value >= normalRangeEnd - boundaryTolerance
      ? binCount - 1
      : Math.min(
        binCount - 1,
        Math.max(0, Math.floor((value + boundaryTolerance) / binWidth)),
      )
    bins[index].count += 1
  }

  const hasOverflow = keepEmptyOverflow || overflowCount > 0
  if (hasOverflow) {
    bins.push({
      start: normalRangeEnd,
      end: normalizeNumber(normalRangeEnd + binWidth),
      count: overflowCount,
      includesMaximum: true,
      isOverflow: true,
    })
  }

  return {
    bins,
    metadata: {
      scale: 'LINEAR',
      binWidth,
      normalRangeStart: 0,
      normalRangeEnd,
      normalBinCount: binCount,
      hasOverflow,
    },
  }
}

function getAdaptiveLinearHistogramRange(
  sortedValues: ReadonlyArray<number>,
  minimumBinWidth: number,
) {
  const percentileValue = quantile(sortedValues, LINEAR_PERCENTILE)
  const safeMinimumWidth = Number.isFinite(minimumBinWidth) && minimumBinWidth > 0
    ? minimumBinWidth
    : 0
  const rawBinWidth = Math.max(0, percentileValue) / LINEAR_NORMAL_BIN_COUNT
  const binWidth = roundUpToNiceWidth(Math.max(rawBinWidth, safeMinimumWidth) || 1)
  const normalRangeEnd = normalizeNumber(binWidth * LINEAR_NORMAL_BIN_COUNT)
  const boundaryTolerance = Math.abs(binWidth) * 1e-10
  const hasOverflow = sortedValues[sortedValues.length - 1] > normalRangeEnd + boundaryTolerance

  return { binWidth, normalRangeEnd, boundaryTolerance, hasOverflow }
}

function buildAdaptiveLinearHistogram(
  sortedValues: ReadonlyArray<number>,
  minimumBinWidth: number,
): { bins: HistogramBin[]; metadata: HistogramMetadata } {
  const { binWidth, normalRangeEnd, boundaryTolerance } = getAdaptiveLinearHistogramRange(sortedValues, minimumBinWidth)
  const bins = Array.from({ length: LINEAR_NORMAL_BIN_COUNT }, (_, index): HistogramBin => ({
    start: normalizeNumber(binWidth * index),
    end: normalizeNumber(binWidth * (index + 1)),
    count: 0,
    includesMaximum: index === LINEAR_NORMAL_BIN_COUNT - 1,
  }))
  let overflowCount = 0

  for (const value of sortedValues) {
    if (value > normalRangeEnd + boundaryTolerance) {
      overflowCount += 1
      continue
    }

    const index = value >= normalRangeEnd - boundaryTolerance
      ? LINEAR_NORMAL_BIN_COUNT - 1
      : Math.min(
        LINEAR_NORMAL_BIN_COUNT - 1,
        Math.max(0, Math.floor((value + boundaryTolerance) / binWidth)),
      )
    bins[index].count += 1
  }

  if (overflowCount > 0) {
    bins.push({
      start: normalRangeEnd,
      end: normalizeNumber(normalRangeEnd + binWidth),
      count: overflowCount,
      includesMaximum: true,
      isOverflow: true,
    })
  }

  return {
    bins,
    metadata: {
      scale: 'LINEAR',
      binWidth,
      normalRangeStart: 0,
      normalRangeEnd,
      normalBinCount: LINEAR_NORMAL_BIN_COUNT,
      hasOverflow: overflowCount > 0,
    },
  }
}

function roundUpToNiceWidth(value: number): number {
  const exponent = Math.floor(Math.log10(value))
  const magnitude = 10 ** exponent
  const normalized = value / magnitude
  const factor = NICE_WIDTH_FACTORS.find((candidate) => normalized <= candidate + 1e-12) ?? 10
  return normalizeNumber(factor * magnitude)
}

function normalizeNumber(value: number): number {
  return Number(value.toPrecision(12))
}

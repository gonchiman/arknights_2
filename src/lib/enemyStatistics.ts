export interface HistogramBin {
  start: number
  end: number
  count: number
  includesMaximum: boolean
}

export type HistogramScale = 'LINEAR' | 'LOG'

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

export function calculateNumericStatistics(
  source: ReadonlyArray<number | null | undefined>,
  preferredBinCount = DEFAULT_BIN_COUNT,
  histogramScale: HistogramScale = 'LINEAR',
): NumericStatistics {
  const values = getFiniteSortedValues(source)
  const count = values.length
  const totalCount = source.length

  if (count === 0) {
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
      bins: [],
    }
  }

  const minimum = values[0]
  const maximum = values[count - 1]
  const mean = values.reduce((sum, value) => sum + value, 0) / count
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / count

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
    bins: buildHistogram(values, preferredBinCount, histogramScale),
  }
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
): HistogramBin[] {
  const minimum = sortedValues[0]
  const maximum = sortedValues[sortedValues.length - 1]

  if (minimum === maximum) {
    return [{ start: minimum, end: maximum, count: sortedValues.length, includesMaximum: true }]
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

  return bins
}

import {
  calculateNumericStatistics,
  type HistogramScale,
  type NumericStatistics,
} from './enemyStatistics.ts'

export interface WeightedHistogramObservation {
  value: number | null | undefined
  weight: number
}

export interface WeightedHistogramOptions {
  preferredBinCount?: number
  scale?: HistogramScale
  minimumLinearBinWidth?: number
  customLinearBinWidth?: number | null
  customLinearUpperBound?: number | null
}

interface FiniteObservation {
  value: number
  weight: number
}

/**
 * Weights are frequencies (or expected frequencies); nonpositive/nonfinite weights
 * are excluded. Bin boundaries use each eligible observation once, so changing
 * its positive weight changes the counts without moving the boundaries.
 */
export function calculateWeightedHistogram(
  source: readonly WeightedHistogramObservation[],
  options: WeightedHistogramOptions = {},
): NumericStatistics {
  const observations: FiniteObservation[] = []
  let missingCount = 0
  let count = 0

  for (const { value, weight } of source) {
    if (!Number.isFinite(weight) || weight <= 0) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      missingCount += weight
      continue
    }
    observations.push({ value, weight })
    count += weight
  }
  observations.sort((left, right) => left.value - right.value)

  const template = calculateNumericStatistics(
    observations.map(({ value }) => value),
    options.preferredBinCount,
    options.scale,
    options.minimumLinearBinWidth,
    options.customLinearBinWidth,
    options.customLinearUpperBound,
  )

  // The existing histogram partitions sorted observations into consecutive bins.
  // Reuse those memberships to retain its endpoint tolerances, overflow rules,
  // and log-scale fallback without expanding a frequency into individual entries.
  let observationIndex = 0
  const bins = template.bins.map((bin) => {
    let binWeight = 0
    const nextIndex = observationIndex + bin.count
    while (observationIndex < nextIndex) {
      binWeight += observations[observationIndex].weight
      observationIndex += 1
    }
    return { ...bin, count: binWeight }
  })

  const result = { ...template, totalCount: count + missingCount, count, missingCount, bins }
  if (observations.length === 0) return result

  const mean = observations.reduce((sum, item) => sum + (item.value * item.weight), 0) / count
  const variance = observations.reduce((sum, item) => sum + (((item.value - mean) ** 2) * item.weight), 0) / count
  const frequencies: FiniteObservation[] = []
  for (const observation of observations) {
    const previous = frequencies.at(-1)
    if (previous?.value === observation.value) previous.weight += observation.weight
    else frequencies.push({ ...observation })
  }
  const integerFrequencies = frequencies.every(({ weight }) => Number.isInteger(weight))

  return {
    ...result,
    firstQuartile: weightedQuantile(frequencies, count, 0.25, integerFrequencies),
    median: weightedQuantile(frequencies, count, 0.5, integerFrequencies),
    mean,
    thirdQuartile: weightedQuantile(frequencies, count, 0.75, integerFrequencies),
    standardDeviation: Math.sqrt(variance),
  }
}

function weightedQuantile(
  sortedFrequencies: readonly FiniteObservation[],
  count: number,
  percentile: number,
  integerFrequencies: boolean,
): number {
  if (integerFrequencies) {
    // Type-7 interpolation matches calculateNumericStatistics on an expanded
    // integer-frequency sample, but looks up just two cumulative-weight ranks.
    const position = (count - 1) * percentile
    const lowerRank = Math.floor(position)
    const upperRank = Math.ceil(position)
    let cumulativeWeight = 0
    let lower: number | undefined
    for (const { value, weight } of sortedFrequencies) {
      cumulativeWeight += weight
      if (lower === undefined && cumulativeWeight > lowerRank) lower = value
      if (cumulativeWeight > upperRank) {
        return lower! + ((value - lower!) * (position - lowerRank))
      }
    }
  } else {
    // Fractional expected frequencies have no individual-entry ranks. Use the
    // inverse weighted CDF, taking the midpoint if a quantile lands exactly
    // between two values. Grouping equal values keeps row splitting irrelevant.
    const target = count * percentile
    let cumulativeWeight = 0
    for (let index = 0; index < sortedFrequencies.length; index += 1) {
      const { value, weight } = sortedFrequencies[index]
      cumulativeWeight += weight
      if (cumulativeWeight > target) return value
      if (cumulativeWeight === target) {
        const nextValue = sortedFrequencies[index + 1]?.value ?? value
        return value + ((nextValue - value) / 2)
      }
    }
  }
  return sortedFrequencies[sortedFrequencies.length - 1].value
}

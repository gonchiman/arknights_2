import { calculateWeightedPercentile } from './enemyWeightedHistogram.ts'

export interface SkillDpsTargetPoint {
  id: string
  targetCount: number | 'UNLIMITED' | null
  y: number
}

export interface SkillDpsTargetGroup {
  key: string
  label: string
  targetCount: number | 'UNLIMITED'
  count: number
  minimum: number
  firstQuartile: number
  median: number
  thirdQuartile: number
  maximum: number
  lowerWhisker: number
  upperWhisker: number
  outliers: readonly number[]
  values: readonly { id: string; value: number }[]
}

/** One skill has unit weight. Unknown capacities never become an unlimited group. */
export function buildSkillDpsTargetGroups(points: readonly SkillDpsTargetPoint[]): SkillDpsTargetGroup[] {
  const grouped = new Map<number | 'UNLIMITED', { id: string; value: number }[]>()
  for (const point of points) {
    const target = point.targetCount
    if (!Number.isFinite(point.y)
      || (target !== 'UNLIMITED' && (typeof target !== 'number' || !Number.isInteger(target) || target <= 0))) continue
    const values = grouped.get(target) ?? []
    values.push({ id: point.id, value: point.y })
    grouped.set(target, values)
  }
  return [...grouped].sort(([left], [right]) => left === 'UNLIMITED' ? 1 : right === 'UNLIMITED' ? -1 : left - right)
    .map(([targetCount, source]) => {
      const values = [...source].sort((left, right) => left.value - right.value)
      const weighted = values.map(({ value }) => ({ value, weight: 1 }))
      // Share the enemy distribution's integer-frequency quartile definition.
      const firstQuartile = calculateWeightedPercentile(weighted, 25)!
      const median = calculateWeightedPercentile(weighted, 50)!
      const thirdQuartile = calculateWeightedPercentile(weighted, 75)!
      const interquartileRange = thirdQuartile - firstQuartile
      const inside = values.filter(({ value }) => value >= firstQuartile - 1.5 * interquartileRange
        && value <= thirdQuartile + 1.5 * interquartileRange)
      const lowerWhisker = inside[0].value
      const upperWhisker = inside[inside.length - 1].value
      return {
        key: targetCount === 'UNLIMITED' ? 'unlimited' : `targets-${targetCount}`,
        label: targetCount === 'UNLIMITED' ? '上限なし' : `${targetCount}体`,
        targetCount,
        count: values.length,
        minimum: values[0].value,
        firstQuartile, median, thirdQuartile,
        maximum: values[values.length - 1].value,
        lowerWhisker, upperWhisker,
        outliers: values.filter(({ value }) => value < lowerWhisker || value > upperWhisker).map(({ value }) => value),
        values,
      }
    })
}

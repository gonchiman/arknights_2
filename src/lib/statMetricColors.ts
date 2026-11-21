/** Stable metric identities with a 20% white mix, shared by distributions and comparisons. */
export const STAT_METRIC_COLORS = Object.freeze({
  maxHp: '#719981',
  attack: '#9983B9',
  defense: '#6192A5',
  magicResistance: '#B97955',
  moveSpeed: '#60A5A2',
  baseAttackTime: '#BD85A3',
  massLevel: '#A09164',
} as const)

export type StatMetricColorKey = keyof typeof STAT_METRIC_COLORS

export const STAT_METRIC_NEUTRAL_COLOR = '#777777'
export const STAT_METRIC_BAR_OPACITY = 1
export const STAT_CUMULATIVE_COLOR = '#454951'
export const STAT_CUMULATIVE_DASH_ARRAY = '6 4'

/** Unknown and derived measures retain a neutral color; never infer from labels. */
export function getStatMetricColor(metricKey: string | undefined): string {
  return metricKey && Object.hasOwn(STAT_METRIC_COLORS, metricKey)
    ? STAT_METRIC_COLORS[metricKey as StatMetricColorKey]
    : STAT_METRIC_NEUTRAL_COLOR
}

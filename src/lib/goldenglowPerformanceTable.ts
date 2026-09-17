import type {
  GoldenglowPerformanceComparisonColumn,
  GoldenglowPerformanceComparisonValue,
} from './goldenglowPerformanceComparison.ts'
import { buildGoldenglowPerformanceDifferences } from './goldenglowPerformanceDifference.ts'
import { buildGoldenglowPerformanceRatios } from './goldenglowPerformanceRatio.ts'

export type GoldenglowPerformanceTableMetric = 'total' | 'difference' | 'ratio' | 'growth'
type DamageKey = Exclude<keyof GoldenglowPerformanceComparisonValue, 'resistance'>

/** Samples the raw breakpoint curves before applying a relative metric. */
export function buildGoldenglowPerformanceTable(
  columns: readonly GoldenglowPerformanceComparisonColumn[],
  metric: GoldenglowPerformanceTableMetric,
  baselineId: string,
  resistances: readonly number[],
): GoldenglowPerformanceComparisonColumn[] {
  const rawColumns = columns.map((column) => ({
    ...column,
    values: column.values.filter((value) => validResistance(value.resistance))
      .sort((a, b) => a.resistance - b.resistance),
  }))
  if (metric === 'ratio' || metric === 'growth') {
    return buildGoldenglowPerformanceRatios(rawColumns, metric, baselineId, resistances)
      .filter((column) => column.build.id !== baselineId)
  }
  const sampled = rawColumns.map((column) => ({
    ...column,
    values: resistances.map((resistance) => ({
      resistance,
      expectedTotalDamage: sample(column.values, resistance, 'expectedTotalDamage'),
      expectedBodyDamage: sample(column.values, resistance, 'expectedBodyDamage'),
      expectedDroneNormalDamage: sample(column.values, resistance, 'expectedDroneNormalDamage'),
      expectedExplosionDamage: sample(column.values, resistance, 'expectedExplosionDamage'),
    })),
  }))
  return metric === 'difference'
    ? buildGoldenglowPerformanceDifferences(sampled, baselineId).filter((column) => column.build.id !== baselineId)
    : sampled
}

/** Percentage cells contain percentage points; the column heading carries their unit. */
export function buildGoldenglowPerformanceTableTsv(columns: readonly {
  label: string
  values: readonly { resistance: number; expectedTotalDamage: number | null }[]
}[], metric: GoldenglowPerformanceTableMetric, digits: number): string {
  if (columns.length === 0) return ''
  const precision = Number.isInteger(digits) && digits >= 0 && digits <= 3 ? digits : 0
  const percentage = metric === 'ratio' || metric === 'growth'
  const valueFormat = new Intl.NumberFormat('en-US', {
    useGrouping: false,
    minimumFractionDigits: percentage ? precision : 0,
    maximumFractionDigits: precision,
  })
  const valuesByResistance = columns.map((column) => new Map(
    column.values.map((value) => [value.resistance, value.expectedTotalDamage]),
  ))
  const rows = [
    ['敵の術耐性', ...columns.map((column) => sanitizeLabel(`${column.label}${percentage ? '（%）' : ''}`))],
    ...columns[0].values.map(({ resistance }) => [
      formatResistance(resistance),
      ...valuesByResistance.map((values) => formatNumber(values.get(resistance), valueFormat)),
    ]),
  ]
  return rows.map((row) => row.join('\t')).join('\r\n')
}

function formatResistance(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (value === 0) return '0'
  const formatted = String(value)
  if (Number.isInteger(value)) return formatted
  // String preserves the input number's precision, including scientific notation.
  const [significand, exponent = '0'] = formatted.split('e')
  const [integer, fraction = ''] = significand.split('.')
  const places = fraction.length - Number(exponent)
  const numerator = `${integer}${fraction}`.replace(/^(-?)0+(?=\d)/, '$1')
  // Preserve extreme scales as text instead of overflowing the denominator.
  if (places > 308) return `'${formatted}`
  return `=${numerator}/1${'0'.repeat(places)}`
}

function formatNumber(value: number | null | undefined, formatter: Intl.NumberFormat): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  const formatted = formatter.format(value)
  if (Number(formatted) === 0) return '0'
  const [integer, fraction] = formatted.split('.')
  if (!fraction) return integer
  // Generated integer arithmetic avoids locale-dependent decimal separators.
  const numerator = `${integer}${fraction}`.replace(/^(-?)0+(?=\d)/, '$1')
  return `=${numerator}/${10 ** fraction.length}`
}

function sanitizeLabel(label: string): string {
  const sanitized = label.replace(/[\t\r\n]+/g, ' ')
  return /^\s*[=+\-@]/.test(sanitized) ? `'${sanitized}` : sanitized
}

function sample(values: readonly GoldenglowPerformanceComparisonValue[], resistance: number, key: DamageKey): number | null {
  if (!validResistance(resistance)) return null
  let start = 0
  let end = values.length
  while (start < end) {
    const middle = Math.floor((start + end) / 2)
    if (values[middle].resistance < resistance) start = middle + 1
    else end = middle
  }
  const upper = values[start]
  const high = upper?.[key]
  if (!finiteValue(high)) return null
  if (upper.resistance === resistance) return high === 0 ? 0 : high
  const lower = values[start - 1]
  const low = lower?.[key]
  // Adjacent nulls remain gaps; a missing endpoint must never be extrapolated.
  if (!finiteValue(low)) return null
  const weight = (resistance - lower.resistance) / (upper.resistance - lower.resistance)
  const result = low * (1 - weight) + high * weight
  return Number.isFinite(result) ? result === 0 ? 0 : result : null
}

function validResistance(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100
}

function finiteValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

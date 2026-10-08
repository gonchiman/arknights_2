import { transformSurtrDpsSeries, type SurtrDpsOutputSeries } from './surtrDpsOutput.ts'

export type SurtrUnequippedMetric = 'difference' | 'ratio' | 'percent'
export type SurtrUnequippedLayout = 'combined' | 'comparison'

/** The independent baseline stays unequipped even when its displayed series is hidden. */
export function buildSurtrUnequippedComparisonSeries(
  series: readonly SurtrDpsOutputSeries[],
  baseline: SurtrDpsOutputSeries | null,
  metric: SurtrUnequippedMetric,
): SurtrDpsOutputSeries[] {
  const targets = series.filter(item => item.id !== 'none')
  const input = baseline ? [...targets, { ...baseline, id: 'none' }] : targets
  const transformed = transformSurtrDpsSeries(input, metric === 'ratio' ? 'total' : metric, 'none')
    .filter(item => item.id !== 'none')
  if (metric !== 'ratio') return transformed

  const baselineValues = pointValues(baseline?.points ?? [])
  return transformed.map(item => ({
    ...item,
    points: item.points.map(point => {
      const base = baselineValues.get(point.x)
      if (!finiteValue(point.value) || !finiteValue(base) || base === 0) return { ...point, value: null }
      // Compute from raw DPS: adding 100 to a growth rate can erase very small ratios.
      const value = point.value / base * 100
      return { ...point, value: Number.isFinite(value) ? value === 0 ? 0 : value : null }
    }),
  }))
}

/** Round only for display, using the same toFixed convention as the S3 results. */
export function formatSurtrUnequippedComparisonValue(
  value: number | null | undefined,
  metric: SurtrUnequippedMetric,
  precision: number,
  useGrouping = true,
): string {
  const formatted = formatNumber(value, precision, useGrouping, metric !== 'ratio')
  return formatted === '—' || metric === 'difference' ? formatted : `${formatted}%`
}

/** Export one value per cell, preserving the requested resistance and module-stage order. */
export function getSurtrUnequippedComparisonTsv(
  series: readonly SurtrDpsOutputSeries[],
  baseline: SurtrDpsOutputSeries | null,
  resistances: readonly number[],
  precision: number,
  metric: SurtrUnequippedMetric,
  layout: SurtrUnequippedLayout,
): string {
  const targets = series.filter(item => item.id !== 'none')
  const comparison = buildSurtrUnequippedComparisonSeries(targets, baseline, metric)
  const rawValues = targets.map(item => pointValues(item.points))
  const comparisonValues = comparison.map(item => pointValues(item.points))
  const baselineValues = pointValues(baseline?.points ?? [])
  const comparisonLabel = metric === 'difference' ? '未装備とのDPS差'
    : metric === 'ratio' ? '未装備に対するDPS比（%）' : '未装備からの増加率（%）'
  const combined = layout === 'combined'
  const labels = targets.map(item => cleanLabel(item.label))
  const header = ['術耐性', ...(combined ? ['未装備 DPS'] : []), ...labels.flatMap(label => [
    ...(combined ? [`${label} DPS`] : []), `${label} ${comparisonLabel}`,
  ])]
  const rows = resistances.map(resistance => [
    String(resistance),
    ...(combined ? [formatNumber(baselineValues.get(resistance), precision, false, false)] : []),
    ...targets.flatMap((_, index) => [
      ...(combined ? [formatNumber(rawValues[index].get(resistance), precision, false, false)] : []),
      formatSurtrUnequippedComparisonValue(comparisonValues[index].get(resistance), metric, precision, false),
    ]),
  ])
  return [header, ...rows].map(row => row.join('\t')).join('\r\n')
}

function pointValues(points: readonly { x: number; value: number | null }[]) {
  return new Map(points.map(point => [point.x, point.value]))
}

function formatNumber(value: number | null | undefined, precision: number, useGrouping: boolean, signed: boolean): string {
  if (!finiteValue(value)) return '—'
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 0
  const rounded = Number(value.toFixed(digits))
  return new Intl.NumberFormat('ja-JP', {
    useGrouping, minimumFractionDigits: digits, maximumFractionDigits: digits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(rounded === 0 ? 0 : rounded)
}

function cleanLabel(label: string): string {
  const clean = label.replace(/[\t\r\n]+/g, ' ').trim()
  return /^[=+\-@]/.test(clean) ? `'${clean}` : clean
}

function finiteValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

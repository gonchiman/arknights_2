export type SurtrDpsMetric = 'total' | 'difference' | 'percent'
export type SurtrDpsLineStyle = 'solid' | 'dashed' | 'dotted'

export interface SurtrDpsOutputSeries {
  id: string
  /** Original module-stage identity, independent of the selected potential. */
  moduleStageId?: string
  potential?: number
  label: string
  color: string
  lineStyle?: SurtrDpsLineStyle
  points: { x: number; value: number | null }[]
}

/** Keeps every series, including the baseline, and compares matching resistance values. */
export function transformSurtrDpsSeries(
  series: readonly SurtrDpsOutputSeries[],
  metric: SurtrDpsMetric,
  baselineId: string,
): SurtrDpsOutputSeries[] {
  const baseline = new Map(series.find((item) => item.id === baselineId)?.points.map((point) => [point.x, point.value]))
  return series.map((item) => ({
    ...item,
    points: item.points.map((point) => {
      if (!isFiniteValue(point.value)) return { ...point, value: null }
      if (metric === 'total') return { ...point }
      const base = baseline.get(point.x)
      if (!isFiniteValue(base) || (metric === 'percent' && base === 0)) return { ...point, value: null }
      const value = metric === 'difference' ? point.value - base : (point.value / base - 1) * 100
      return { ...point, value: Number.isFinite(value) ? value === 0 ? 0 : value : null }
    }),
  }))
}

/** Copies already-transformed values in the requested row/column order as plain TSV. */
export function getSurtrDpsOutputTsv(
  series: readonly SurtrDpsOutputSeries[],
  resistances: readonly number[],
  precision: number,
  metric: SurtrDpsMetric,
): string {
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 3 ? precision : 0
  const format = new Intl.NumberFormat('en-US', {
    useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits,
  })
  const values = series.map((item) => new Map(item.points.map((point) => [point.x, point.value])))
  const formatValue = (value: number | null | undefined) => {
    if (!isFiniteValue(value)) return '—'
    const rounded = Number(value.toFixed(digits))
    const unsignedZero = format.format(Object.is(rounded, -0) ? 0 : rounded)
    return `${unsignedZero}${metric === 'percent' ? '%' : ''}`
  }
  return [
    ['術耐性', ...series.map((item) => item.label.replace(/[\t\r\n]+/g, ' ').trim())],
    ...resistances.map((resistance) => [
      String(resistance), ...values.map((points) => formatValue(points.get(resistance))),
    ]),
  ].map((row) => row.join('\t')).join('\r\n')
}

function isFiniteValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

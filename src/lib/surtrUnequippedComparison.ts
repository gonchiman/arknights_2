import { transformSurtrDpsSeries, type SurtrDpsOutputSeries } from './surtrDpsOutput.ts'
import { getSurtrDpsResistanceRating } from './surtrDpsResistance.ts'

export type SurtrUnequippedMetric = 'difference' | 'ratio' | 'percent'
export type SurtrUnequippedLayout = 'combined' | 'comparison'
export type SurtrUnequippedRankMode = 'none' | 'inline' | 'merged'
export type SurtrUnequippedColumnOrder = 'module' | 'blocking'
export type SurtrUnequippedComparisonBase = 'unequipped' | 'previous'

export interface SurtrUnequippedBlockingComparison {
  blocking: boolean
  series: readonly SurtrDpsOutputSeries[]
  baseline: SurtrDpsOutputSeries
  referenceSeries?: readonly SurtrDpsOutputSeries[]
}

/** Return the exact previous stage within the same module; Lv.1 starts from unequipped. */
export function getSurtrPreviousStageId(id: string): string | null {
  const match = /^([^\s:]+):lv([123])$/.exec(id)
  if (!match || match[1] === 'none') return null
  return match[2] === '1' ? 'none' : `${match[1]}:lv${Number(match[2]) - 1}`
}

/** References are independent of the displayed stages, so a hidden previous stage remains usable. */
export function getSurtrStageComparisonBaseline(
  item: { id: string },
  baseline: SurtrDpsOutputSeries | null,
  comparisonBase: SurtrUnequippedComparisonBase = 'unequipped',
  referenceSeries: readonly SurtrDpsOutputSeries[] = [],
): SurtrDpsOutputSeries | null {
  if (comparisonBase === 'unequipped') return baseline
  const previousId = getSurtrPreviousStageId(item.id)
  if (previousId === 'none') return baseline
  return previousId === null ? null : referenceSeries.find(reference => reference.id === previousId) ?? null
}

/** Keep the live table, image and clipboard in the same module/condition order. */
export function getSurtrUnequippedColumns<T>(
  targets: readonly SurtrDpsOutputSeries[],
  conditions: readonly T[],
  columnOrder: SurtrUnequippedColumnOrder = 'module',
) {
  return columnOrder === 'blocking'
    ? conditions.flatMap(condition => targets.map(item => ({ item, condition })))
    : targets.flatMap(item => conditions.map(condition => ({ item, condition })))
}

/** Compute with an independent baseline even when its displayed series is hidden. */
export function buildSurtrUnequippedComparisonSeries(
  series: readonly SurtrDpsOutputSeries[],
  baseline: SurtrDpsOutputSeries | null,
  metric: SurtrUnequippedMetric,
  comparisonBase: SurtrUnequippedComparisonBase = 'unequipped',
  referenceSeries: readonly SurtrDpsOutputSeries[] = [],
): SurtrDpsOutputSeries[] {
  const targets = series.filter(item => item.id !== 'none')
  if (comparisonBase === 'previous') {
    return targets.flatMap(item => buildSurtrUnequippedComparisonSeries(
      [item], getSurtrStageComparisonBaseline(item, baseline, comparisonBase, referenceSeries), metric,
    ))
  }
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
  blockingComparison?: readonly SurtrUnequippedBlockingComparison[],
  rankMode: SurtrUnequippedRankMode = 'none',
  columnOrder: SurtrUnequippedColumnOrder = 'module',
  comparisonBase: SurtrUnequippedComparisonBase = 'unequipped',
  referenceSeries: readonly SurtrDpsOutputSeries[] = [],
): string {
  const targets = series.filter(item => item.id !== 'none')
  const conditions = blockingComparison === undefined
    ? [{ label: '', series: targets, baseline, referenceSeries }]
    : [false, true].map(blocking => {
      const condition = blockingComparison.find(item => item.blocking === blocking)
      return {
        label: blocking ? '対象を自身でブロック' : '未ブロック',
        series: condition?.series ?? [],
        baseline: condition?.baseline ?? null,
        referenceSeries: condition?.referenceSeries ?? [],
      }
    })
  const conditionValues = conditions.map(condition => ({
    label: condition.label,
    baselineLabels: new Map(targets.map(item => [item.id, cleanLabel(
      getSurtrStageComparisonBaseline(item, condition.baseline, comparisonBase, condition.referenceSeries)?.label
      ?? (getSurtrPreviousStageId(item.id) === 'none' ? '未装備' : getSurtrPreviousStageId(item.id) ?? '—'),
    )])),
    raw: new Map(condition.series.map(item => [item.id, pointValues(item.points)])),
    comparison: new Map(buildSurtrUnequippedComparisonSeries(condition.series, condition.baseline, metric, comparisonBase, condition.referenceSeries)
      .map(item => [item.id, pointValues(item.points)])),
  }))
  const baselineValues = pointValues(baseline?.points ?? [])
  const comparisonLabel = comparisonBase === 'previous'
    ? metric === 'difference' ? '前段階とのDPS差'
      : metric === 'ratio' ? '前段階に対するDPS比（%）' : '前段階からの増加率（%）'
    : metric === 'difference' ? '未装備とのDPS差'
      : metric === 'ratio' ? '未装備に対するDPS比（%）' : '未装備からの増加率（%）'
  const combined = layout === 'combined'
  const includeUnequippedDps = combined && comparisonBase === 'unequipped'
  const columns = getSurtrUnequippedColumns(targets, conditionValues, columnOrder)
  const header = ['術耐性', ...(rankMode !== 'none' ? ['術耐性ランク'] : []), ...(includeUnequippedDps ? ['未装備 DPS'] : []), ...columns.flatMap(({ item, condition }) => {
    const label = cleanLabel(item.label)
    const heading = condition.label ? columnOrder === 'blocking' ? `${condition.label} ${label}` : `${label} ${condition.label}` : label
    const referenceLabel = comparisonBase === 'previous' ? `（基準：${condition.baselineLabels.get(item.id)}）` : ''
    return [...(combined ? [`${heading} DPS`] : []), `${heading} ${comparisonLabel}${referenceLabel}`]
  })]
  const rows = resistances.map(resistance => [
    String(resistance),
    ...(rankMode !== 'none' ? [getSurtrDpsResistanceRating(resistance)?.rating ?? '—'] : []),
    ...(includeUnequippedDps ? [formatNumber(baselineValues.get(resistance), precision, false, false)] : []),
    ...columns.flatMap(({ item, condition }) => [
      ...(combined ? [formatNumber(condition.raw.get(item.id)?.get(resistance), precision, false, false)] : []),
      formatSurtrUnequippedComparisonValue(condition.comparison.get(item.id)?.get(resistance), metric, precision, false),
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

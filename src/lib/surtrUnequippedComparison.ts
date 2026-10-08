import type { SurtrDpsOutputSeries } from './surtrDpsOutput.ts'
import { getSurtrDpsResistanceRating } from './surtrDpsResistance.ts'

export type SurtrUnequippedMetric = 'difference' | 'ratio' | 'percent'
export type SurtrUnequippedLayout = 'combined' | 'comparison'
export type SurtrUnequippedRankMode = 'none' | 'inline' | 'merged'
export type SurtrUnequippedColumnOrder = 'module' | 'blocking'
export type SurtrUnequippedComparisonBase = 'unequipped' | 'previous'
  | 'potential-1' | 'potential-2' | 'potential-3' | 'potential-4' | 'potential-5' | 'potential-6'
export type SurtrUnequippedComparisonQuantity = 'dps' | 'expected-damage'

export interface SurtrUnequippedBlockingComparison {
  blocking: boolean
  series: readonly SurtrDpsOutputSeries[]
  baseline: SurtrDpsOutputSeries
  referenceSeries?: readonly SurtrDpsOutputSeries[]
}

type SeriesIdentity = Pick<SurtrDpsOutputSeries, 'id' | 'moduleStageId' | 'potential'>

export function getSurtrComparisonBaseLabel(base: SurtrUnequippedComparisonBase = 'unequipped'): string {
  return base === 'unequipped' ? '未装備' : base === 'previous' ? '前段階' : `潜在${base.slice('potential-'.length)}`
}

export function isSurtrUnequippedSeries(item: SeriesIdentity): boolean {
  return seriesIdentity(item).stageId === 'none'
}

/** Fixed-potential comparisons can include selected unequipped series as ordinary targets. */
export function getSurtrComparisonTargets(
  series: readonly SurtrDpsOutputSeries[],
  comparisonBase: SurtrUnequippedComparisonBase = 'unequipped',
): SurtrDpsOutputSeries[] {
  return series.filter(item => comparisonBase.startsWith('potential-') || !isSurtrUnequippedSeries(item))
}

/** One raw unequipped column for each selected potential, even when it is hidden. */
export function getSurtrUnequippedBaselines(
  series: readonly SurtrDpsOutputSeries[],
  baseline: SurtrDpsOutputSeries | null,
  referenceSeries: readonly SurtrDpsOutputSeries[] = [],
): SurtrDpsOutputSeries[] {
  const potentials = [...new Set(series.map(item => seriesIdentity(item).potential).filter(potential => potential !== undefined))]
  if (!potentials.length) return baseline ? [baseline] : []
  const references = [...referenceSeries, ...(baseline ? [baseline] : []), ...series]
  return potentials.flatMap(potential => {
    const found = references.find(item => {
      const identity = seriesIdentity(item)
      return identity.stageId === 'none' && identity.potential === potential
    })
    return found ? [found] : []
  })
}

/** Return the exact previous stage within the same module; Lv.1 starts from unequipped. */
export function getSurtrPreviousStageId(id: string): string | null {
  const match = /^([^\s:]+):lv([123])$/.exec(id)
  if (!match || match[1] === 'none') return null
  return match[2] === '1' ? 'none' : `${match[1]}:lv${Number(match[2]) - 1}`
}

/** References are independent of the displayed stages, so a hidden previous stage remains usable. */
export function getSurtrStageComparisonBaseline(
  item: SeriesIdentity,
  baseline: SurtrDpsOutputSeries | null,
  comparisonBase: SurtrUnequippedComparisonBase = 'unequipped',
  referenceSeries: readonly SurtrDpsOutputSeries[] = [],
): SurtrDpsOutputSeries | null {
  const identity = seriesIdentity(item)
  const fixedPotential = /^potential-([1-6])$/.exec(comparisonBase)
  if (fixedPotential) {
    return findReference(identity.stageId, Number(fixedPotential[1]), referenceSeries, baseline)
  }
  if (identity.potential === undefined) {
    if (comparisonBase === 'unequipped') return baseline
    const previousId = getSurtrPreviousStageId(identity.stageId)
    if (previousId === 'none') return baseline
    return previousId === null ? null : referenceSeries.find(reference => reference.id === previousId) ?? null
  }
  const baselineStageId = comparisonBase === 'unequipped' ? 'none' : getSurtrPreviousStageId(identity.stageId)
  return baselineStageId === null ? null : findReference(baselineStageId, identity.potential, referenceSeries, baseline)
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
  return getSurtrComparisonTargets(series, comparisonBase).map(item => {
    const baselineValues = pointValues(getSurtrStageComparisonBaseline(item, baseline, comparisonBase, referenceSeries)?.points ?? [])
    return { ...item, points: item.points.map(point => {
      const base = baselineValues.get(point.x)
      if (!finiteValue(point.value) || !finiteValue(base) || (metric !== 'difference' && base === 0)) return { ...point, value: null }
      // Compute from raw DPS: adding 100 to a growth rate can erase very small ratios.
      const value = metric === 'difference' ? point.value - base
        : metric === 'ratio' ? point.value / base * 100 : (point.value / base - 1) * 100
      return { ...point, value: Number.isFinite(value) ? value === 0 ? 0 : value : null }
    }) }
  })
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
  quantity: SurtrUnequippedComparisonQuantity = 'dps',
): string {
  const targets = getSurtrComparisonTargets(series, comparisonBase)
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
      ?? (comparisonBase.startsWith('potential-') ? getSurtrComparisonBaseLabel(comparisonBase)
        : getSurtrPreviousStageId(seriesIdentity(item).stageId) === 'none' ? '未装備'
          : getSurtrPreviousStageId(seriesIdentity(item).stageId) ?? '—'),
    )])),
    raw: new Map(condition.series.map(item => [item.id, pointValues(item.points)])),
    comparison: new Map(buildSurtrUnequippedComparisonSeries(condition.series, condition.baseline, metric, comparisonBase, condition.referenceSeries)
      .map(item => [item.id, pointValues(item.points)])),
  }))
  const baselines = getSurtrUnequippedBaselines(series, baseline, referenceSeries)
  const baselineColumns = series.some(item => seriesIdentity(item).potential !== undefined)
    ? baselines.map(item => ({ label: cleanLabel(item.label), values: pointValues(item.points) }))
    : [{ label: '未装備', values: pointValues(baseline?.points ?? []) }]
  const baseLabel = getSurtrComparisonBaseLabel(comparisonBase)
  const quantityLabel = quantity === 'expected-damage' ? '総ダメージ期待値' : 'DPS'
  const comparisonLabel = metric === 'difference' ? `${baseLabel}との${quantity === 'expected-damage' ? 'ダメージ' : 'DPS'}差`
    : metric === 'ratio' ? `${baseLabel}に対する${quantityLabel}比（%）` : `${baseLabel}からの増加率（%）`
  const combined = layout === 'combined'
  const includeUnequippedDps = combined && comparisonBase === 'unequipped'
  const columns = getSurtrUnequippedColumns(targets, conditionValues, columnOrder)
  const header = ['術耐性', ...(rankMode !== 'none' ? ['術耐性ランク'] : []), ...(includeUnequippedDps ? baselineColumns.map(item => `${item.label} ${quantityLabel}`) : []), ...columns.flatMap(({ item, condition }) => {
    const label = cleanLabel(item.label)
    const heading = condition.label ? columnOrder === 'blocking' ? `${condition.label} ${label}` : `${label} ${condition.label}` : label
    const referenceLabel = comparisonBase !== 'unequipped' ? `（基準：${condition.baselineLabels.get(item.id)}）` : ''
    return [...(combined ? [`${heading} ${quantityLabel}`] : []), `${heading} ${comparisonLabel}${referenceLabel}`]
  })]
  const rows = resistances.map(resistance => [
    String(resistance),
    ...(rankMode !== 'none' ? [getSurtrDpsResistanceRating(resistance)?.rating ?? '—'] : []),
    ...(includeUnequippedDps ? baselineColumns.map(item => formatNumber(item.values.get(resistance), precision, false, false)) : []),
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

function seriesIdentity(item: SeriesIdentity): { stageId: string; potential: number | undefined } {
  const match = /^(.*):pot([1-6])$/.exec(item.id)
  const potential = Number.isInteger(item.potential) && item.potential! >= 1 && item.potential! <= 6
    ? item.potential : match ? Number(match[2]) : undefined
  return { stageId: item.moduleStageId ?? match?.[1] ?? item.id, potential }
}

function findReference(
  stageId: string,
  potential: number,
  references: readonly SurtrDpsOutputSeries[],
  baseline: SurtrDpsOutputSeries | null,
): SurtrDpsOutputSeries | null {
  return [...references, ...(baseline ? [baseline] : [])].find(reference => {
    const identity = seriesIdentity(reference)
    return identity.stageId === stageId && identity.potential === potential
  }) ?? null
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

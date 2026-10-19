import type { SurtrDpsOutputSeries } from './surtrDpsOutput.ts'
import { buildSurtrUnequippedComparisonSeries, getSurtrComparisonTargets, getSurtrStageComparisonBaseline,
  getSurtrUnequippedColumns, isSurtrUnequippedSeries, type SurtrUnequippedBlockingComparison,
  type SurtrUnequippedColumnOrder, type SurtrUnequippedComparisonBase, type SurtrUnequippedMetric } from './surtrUnequippedComparison.ts'
import { getSurtrUnequippedColorScaleMaximum } from './surtrUnequippedColorScale.ts'
import type { SurtrRemnantComparisonState } from './surtrRemnantComparison.ts'

export type SurtrComparisonImageLayout = 'current' | 'transpose' | 'stacked' | 'split'

interface ComparisonImageData {
  series: readonly SurtrDpsOutputSeries[]
  baseline: SurtrDpsOutputSeries
  resistances: readonly number[]
  metric: SurtrUnequippedMetric
  comparisonBase?: SurtrUnequippedComparisonBase
  columnOrder?: SurtrUnequippedColumnOrder
  referenceSeries?: readonly SurtrDpsOutputSeries[]
  blockingComparison?: readonly SurtrUnequippedBlockingComparison[]
  colorScaleMaximum?: number
  remnantComparison?: readonly SurtrRemnantComparisonState[]
}

/** The screen and every export arrangement use the same raw values and references. */
export function buildSurtrComparisonImageColumns(data: ComparisonImageData) {
  const targets = getSurtrComparisonTargets(data.series, data.comparisonBase)
  const groups = data.blockingComparison === undefined
    ? [{ blocking: undefined, series: targets, baseline: data.baseline, referenceSeries: data.referenceSeries }]
    : [false, true].map(blocking => ({ blocking, ...data.blockingComparison?.find(group => group.blocking === blocking) }))
  const conditions = groups.map(group => {
    const comparison = buildSurtrUnequippedComparisonSeries(group.series ?? [], group.baseline ?? null,
      data.metric, data.comparisonBase, group.referenceSeries ?? [])
    return { blocking: group.blocking, baseline: group.baseline ?? null, referenceSeries: group.referenceSeries ?? [],
      raw: new Map(group.series?.map(item => [item.id, new Map(item.points.map(point => [point.x, point.value]))])),
      comparison: new Map(comparison.map(item => [item.id, new Map(item.points.map(point => [point.x, point.value]))])) }
  })
  return getSurtrUnequippedColumns(targets, conditions, data.columnOrder).map(({ item, condition }) => ({
    item, seriesId: item.id, blocking: condition.blocking, raw: condition.raw.get(item.id),
    comparison: condition.comparison.get(item.id),
    reference: getSurtrStageComparisonBaseline(item, condition.baseline, data.comparisonBase, condition.referenceSeries),
  }))
}

/** Freeze the full table's scale before any condition or stage is filtered. */
export function getSurtrComparisonImageColorScaleMaximum(data: ComparisonImageData): number {
  if (data.colorScaleMaximum !== undefined && Number.isFinite(data.colorScaleMaximum) && data.colorScaleMaximum >= 0) {
    return data.colorScaleMaximum
  }
  if (data.remnantComparison !== undefined) return Math.max(0, ...data.remnantComparison.map(state =>
    getSurtrComparisonImageColorScaleMaximum({ ...data, ...state, remnantComparison: undefined, colorScaleMaximum: undefined })))
  return getSurtrUnequippedColorScaleMaximum(buildSurtrComparisonImageColumns(data)
    .flatMap(column => data.resistances.map(resistance => column.comparison?.get(resistance))), data.metric)
}

function moduleLevel(item: SurtrDpsOutputSeries): number | null {
  const level = /:lv([123])(?:$|:pot[1-6]$)/.exec(item.moduleStageId ?? item.id)?.[1]
  return level ? Number(level) : null
}

/** Generate only stages represented by selected installed targets. */
export function getSurtrComparisonImageStageLevels(data: Pick<ComparisonImageData, 'series' | 'comparisonBase'>): number[] {
  return [...new Set(getSurtrComparisonTargets(data.series, data.comparisonBase)
    .flatMap(item => moduleLevel(item) === null ? [] : [moduleLevel(item)!]))].sort((a, b) => a - b)
}

/** Preserve hidden previous stages and fixed-potential references when splitting. */
export function getSurtrComparisonImageStageSnapshot<T extends ComparisonImageData>(data: T, level: number): T & {
  imageLayout: 'split'; moduleLevel: number; colorScaleMaximum: number
} {
  if (!getSurtrComparisonImageStageLevels(data).includes(level)) throw new Error('選択中のMODにこの段階はありません。')
  const selected = (item: SurtrDpsOutputSeries) => isSurtrUnequippedSeries(item) || moduleLevel(item) === level
  const filterState = <S extends Pick<ComparisonImageData, 'series' | 'baseline' | 'referenceSeries' | 'blockingComparison'>>(state: S): S => ({
    ...state,
    series: state.series.filter(selected),
    referenceSeries: mergeReferences(state.referenceSeries, state.series, [state.baseline]),
    blockingComparison: state.blockingComparison?.map(group => ({ ...group,
      series: group.series.filter(selected),
      referenceSeries: mergeReferences(group.referenceSeries, group.series, [group.baseline]),
    })),
  })
  return { ...filterState(data), imageLayout: 'split', moduleLevel: level,
    colorScaleMaximum: getSurtrComparisonImageColorScaleMaximum(data),
    ...(data.remnantComparison !== undefined ? { remnantComparison: data.remnantComparison.map(filterState) } : {}),
  }
}

function mergeReferences(...groups: (readonly SurtrDpsOutputSeries[] | undefined)[]): SurtrDpsOutputSeries[] {
  const references = new Map<string, SurtrDpsOutputSeries>()
  for (const group of groups) for (const item of group ?? []) if (!references.has(item.id)) references.set(item.id, item)
  return [...references.values()]
}

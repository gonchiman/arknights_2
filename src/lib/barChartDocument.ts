import { createChartImageFilename, withChartImageAspect } from './chartImageFilename.ts'
import type { StatRankBand } from './statRankBands.ts'
import { createZeroBasedValueAxis } from './chartValueAxis.ts'

export interface BarChartDisplaySettings {
  values: boolean
  axisBand: boolean
  percent: boolean
  cumulative: boolean
  cumulativeBand?: boolean
  rankBand?: boolean
  comparisonBand?: 'cumulative' | 'rank' | 'none'
  /** Stable category IDs; never recover identity from a displayed label. */
  selectedRanks?: readonly string[]
}

export const DEFAULT_BAR_CHART_DISPLAY_SETTINGS: Readonly<BarChartDisplaySettings> = Object.freeze({
  values: true, axisBand: true, percent: false, cumulative: false, cumulativeBand: false, rankBand: false,
})

export interface BarChartInterval {
  /** Null preserves an unbounded lower endpoint, such as the first rating range. */
  readonly start: number | null
  /** An overflow class has no finite upper endpoint. */
  readonly end: number | null
  readonly includesMinimum: boolean
  readonly includesMaximum: boolean
  readonly isOverflow: boolean
}

export interface BarChartBin {
  readonly id: string
  readonly label: string
  /** Zero is observed zero; null is an unavailable result. */
  readonly value: number | null
  readonly point?: number
  readonly interval?: BarChartInterval
  /** Proportions use the source's valid population, never the sum of displayed heights. */
  readonly share?: number | null
  readonly cumulativeShare?: number | null
  /** A threshold's upper-tail rank is not a histogram cumulative proportion. */
  readonly rankPercentage?: number
  readonly rankCutoff?: number
}

export type BarChartItemKind = 'interval' | 'point' | 'category'

export interface BarChartSemantics {
  readonly kind: 'histogram' | 'correspondence' | 'comparison'
  readonly subject: string
  /** Metric represented by single-series bars; display labels never determine appearance. */
  readonly metricKey?: string
  /** Meaning of the axis arranging bars, independent of drawing orientation and category alignment. */
  readonly itemKind?: BarChartItemKind
  readonly xLabel: string
  readonly xUnit?: string
  readonly xQualifier?: string
  readonly xBandTitle?: string
  readonly yLabel: string
  readonly yUnit?: string
}

export interface BarChartPopulation {
  readonly total: number
  readonly valid: number
  readonly missing: number
  readonly basis: 'single-stat' | 'paired-stats'
}

export interface BarChartSeries {
  /** Identity describes the slot, so selecting the same metric twice remains two series. */
  readonly id: 'left' | 'right'
  readonly label: string
  readonly metricKey: string
  readonly bins: readonly BarChartBin[]
  readonly population: BarChartPopulation
}

export interface BarChartSource {
  readonly providerId: string
  readonly aggregationVersion: {
    readonly id: string
    readonly label: string
    readonly sourceRevision: string
    readonly ruleVersion: string
  }
  readonly aggregationScope: 'all' | 'main'
  readonly scopeLabel: string
  readonly countMode: 'TYPES' | 'MAPS' | 'SPAWNS'
  readonly countLabel: string
  readonly countUnit: string
  /** Mirrored comparisons have per-series populations and no shared denominator. */
  readonly population: BarChartPopulation | null
  readonly coverage: {
    readonly mapCount: number
    readonly missingMapCount: number
    readonly spawnMapCount: number
    readonly spawnExcludedMapCount: number
    readonly excludedMapCount?: number
    readonly lowerBoundMapCount?: number
    readonly expectedMapCount?: number
  }
  readonly coverageLabel: string
  readonly parameters: readonly { readonly label: string; readonly value: string }[]
}

/** Plain data only: this contract contains no formatter, JSX, DOM reference, or live state. */
export interface BarChartDocument {
  readonly schemaVersion: 1
  readonly id: string
  readonly title: string
  readonly xAxisTitle: string
  readonly yAxisTitle: string
  readonly xKind: BarChartItemKind
  readonly layout?: 'mirrored'
  readonly series?: readonly [BarChartSeries, BarChartSeries]
  /** In mirrored layout these are aligned categories only, with value:null. */
  readonly bins: readonly BarChartBin[]
  /** Source-projected fractions of the plot width; rendering never derives rating boundaries. */
  readonly rankBands?: readonly StatRankBand[]
  /** An aligned row of source-formatted lines, such as numeric bounds under rating classes. */
  readonly secondaryAxisBand?: {
    readonly title: string
    readonly labels: readonly (readonly string[])[]
  }
  readonly conditions: string
  readonly filenameParts: readonly string[]
  readonly fractionDigits: number
  readonly capabilities: { readonly percentages: boolean; readonly cumulative: boolean; readonly rankBands?: boolean }
  readonly semantics: BarChartSemantics
  readonly source: BarChartSource
}

export function getBarChartLabels(semantics: BarChartSemantics, xKind: BarChartDocument['xKind']) {
  const xQualifier = semantics.xQualifier ?? (xKind === 'interval' ? '階級'
    : semantics.kind === 'correspondence' && xKind === 'point' ? '下限' : '')
  const yLabel = `${semantics.kind === 'correspondence' ? '対応する' : ''}${semantics.yLabel}`
  const xDetails = [xQualifier, semantics.xUnit].filter(Boolean).join('・')
  return {
    title: semantics.kind === 'comparison' ? `${semantics.subject}の評価別分布`
      : semantics.kind === 'histogram' ? `${semantics.subject}のヒストグラム`
      : `${semantics.yLabel}と${semantics.xLabel}の対応（${semantics.xLabel}別）`,
    xAxisTitle: `${semantics.xLabel}${xDetails ? `（${xDetails}）` : ''}`,
    yAxisTitle: `${yLabel}${semantics.yUnit ? `（${semantics.yUnit}）` : ''}`,
  }
}

const formatCount = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 12 })

export function getBarChartConditions(source: BarChartSource, series?: readonly BarChartSeries[]): string {
  return [
    source.aggregationVersion.label || `集計版 ${source.aggregationVersion.id}`,
    source.scopeLabel,
    source.countLabel + (source.population ? ` ${formatCount(source.population.valid)}${source.countUnit}` : ''),
    source.population && source.population.missing > 0 ? `値なし ${formatCount(source.population.missing)}${source.countUnit}を除外` : '',
    source.population?.basis === 'paired-stats' ? '防御力・術耐性の両方が有効' : '',
    ...(series ?? []).map(item => `${item.id === 'left' ? '左' : '右'} ${item.label} ${formatCount(item.population.valid)}${source.countUnit}`
      + (item.population.missing > 0 ? `（値なし ${formatCount(item.population.missing)}${source.countUnit}）` : '')),
    source.coverageLabel,
    ...source.parameters.map(({ label, value }) => `${label} ${value}`),
  ].filter(Boolean).join(' · ')
}

type DocumentInput = Pick<BarChartDocument, 'layout' | 'series' | 'xKind' | 'bins' | 'rankBands' | 'secondaryAxisBand' | 'filenameParts' | 'fractionDigits' | 'capabilities' | 'semantics' | 'source'>

function validPopulation(population: BarChartPopulation) {
  return population && ['single-stat', 'paired-stats'].includes(population.basis)
    && [population.total, population.valid, population.missing].every(value => Number.isFinite(value) && value >= 0)
    && Math.abs(population.total - population.valid - population.missing) <= Math.max(1, population.total) * 1e-10
}

function invalidInterval(interval: BarChartInterval | undefined): boolean {
  return Boolean(interval && ((interval.start !== null && !Number.isFinite(interval.start))
    || (interval.end !== null && (!Number.isFinite(interval.end)
      || (interval.start !== null && interval.end < interval.start)))
    || typeof interval.includesMinimum !== 'boolean' || typeof interval.includesMaximum !== 'boolean'
    || (interval.start === null && interval.includesMinimum)
    || (interval.end === null && interval.includesMaximum)
    || (interval.isOverflow !== (interval.end === null))))
}

/** Freeze a detached JSON snapshot so later source edits cannot change a preview or export. */
export function createBarChartDocument(input: DocumentInput): BarChartDocument {
  if (input.semantics.metricKey !== undefined
    && (typeof input.semantics.metricKey !== 'string' || !input.semantics.metricKey.trim())) {
    throw new Error('棒グラフのステータスを確認できませんでした。')
  }
  if (input.semantics.itemKind !== undefined && !['interval', 'point', 'category'].includes(input.semantics.itemKind)) {
    throw new Error('棒グラフの階級の意味を確認できませんでした。')
  }
  if (!Number.isInteger(input.fractionDigits) || input.fractionDigits < 0 || input.fractionDigits > 12
    || (input.source.population !== null && !validPopulation(input.source.population))) {
    throw new Error('棒グラフの集計値を確認できませんでした。')
  }
  if (input.layout !== undefined && input.layout !== 'mirrored') throw new Error('棒グラフの配置を確認できませんでした。')
  if (input.layout === 'mirrored') {
    if (input.xKind !== 'category' || input.semantics.kind !== 'comparison' || input.source.population !== null
      || !Array.isArray(input.series) || input.series.length !== 2
      || input.bins.some(bin => bin.value !== null || bin.point !== undefined || bin.interval !== undefined)
      || input.series.some((series, index) => !series || series.id !== (index === 0 ? 'left' : 'right')
        || !series.label?.trim() || !series.metricKey?.trim() || !validPopulation(series.population)
        || !Array.isArray(series.bins) || series.bins.length !== input.bins.length
        || series.bins.some((bin, binIndex) => !bin || bin.id !== input.bins[binIndex].id
          || bin.label !== input.bins[binIndex].label
          || (bin.value !== null && (!Number.isFinite(bin.value) || bin.value < 0))
          || (bin.point !== undefined && (!Number.isFinite(bin.point) || bin.interval !== undefined))
          || invalidInterval(bin.interval)
          || [bin.share, bin.cumulativeShare].some(value => value !== null
            && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1))
          || (series.population.valid === 0 && (bin.share !== null || bin.cumulativeShare !== null))))) {
      throw new Error('棒グラフの比較系列を確認できませんでした。')
    }
  } else if (input.series !== undefined || input.source.population === null || input.semantics.kind === 'comparison') {
    throw new Error('棒グラフの比較系列を確認できませんでした。')
  }
  const ids = new Set<string>()
  for (const bin of input.bins) {
    if (!bin.id || ids.has(bin.id) || (bin.value !== null && !Number.isFinite(bin.value))
      || (bin.point !== undefined && !Number.isFinite(bin.point))
      || [bin.share, bin.cumulativeShare].some(value => value !== undefined && value !== null
        && (!Number.isFinite(value) || value < 0 || value > 1))
      || (input.xKind === 'point' && (bin.point === undefined || bin.interval !== undefined))
      || (input.xKind === 'interval' && (!bin.interval || bin.point !== undefined))
      || invalidInterval(bin.interval)) {
      throw new Error('棒グラフの階級と値を確認できませんでした。')
    }
    ids.add(bin.id)
  }
  if (input.secondaryAxisBand !== undefined) {
    const band = input.secondaryAxisBand
    if (!band || typeof band.title !== 'string' || !band.title.trim() || !Array.isArray(band.labels)
      || band.labels.length !== input.bins.length
      || band.labels.some(lines => !Array.isArray(lines) || !lines.length
        || lines.some(line => typeof line !== 'string' || !line.trim()))) {
      throw new Error('棒グラフの範囲帯を確認できませんでした。')
    }
  }
  if (input.rankBands !== undefined) {
    if (!Array.isArray(input.rankBands) || input.capabilities.rankBands !== true) {
      throw new Error('棒グラフの評価帯を確認できませんでした。')
    }
    let previousEnd = 0
    for (const band of input.rankBands) {
      if (!band || typeof band.rating !== 'string' || !band.rating.trim()
        || typeof band.label !== 'string' || !band.label.trim()
        || !Number.isInteger(band.index) || band.index < 0
        || !Number.isFinite(band.start) || !Number.isFinite(band.end)
        || band.start < 0 || band.end > 1 || band.start > band.end
        || band.start < previousEnd - 1e-12
        || (band.pointValue === undefined ? band.start === band.end
          : !Number.isFinite(band.pointValue) || band.start !== band.end)) {
        throw new Error('棒グラフの評価帯を確認できませんでした。')
      }
      previousEnd = band.end
    }
  }
  const detached = JSON.parse(JSON.stringify(input)) as DocumentInput
  const content = { schemaVersion: 1 as const, ...detached,
    ...getBarChartLabels(detached.semantics, detached.xKind), conditions: getBarChartConditions(detached.source, detached.series) }
  let hash = 2166136261
  for (const character of JSON.stringify(content)) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0
  return freezeDeep({ ...content, id: `bar-chart-${hash.toString(16).padStart(8, '0')}` })
}

export function getBarChartFilename(document: BarChartDocument, settings: BarChartDisplaySettings, aspectRatio?: number): string {
  if (document.layout === 'mirrored') {
    const selection = getBarChartSelectionSummary(document, settings.selectedRanks ?? [])
    return withChartImageAspect(createChartImageFilename(document.title, [
      ...document.filenameParts, '幅1920px',
      getBarChartComparisonBand(settings) === 'cumulative' && '累積割合帯',
      getBarChartComparisonBand(settings) === 'rank' && '階級割合帯',
      selection && `評価${selection.label}強調`,
    ]), aspectRatio)
  }
  const filename = createChartImageFilename(document.title, [
    ...document.filenameParts,
    '幅1920px',
    settings.values && '数値表示',
    settings.axisBand && '階級帯',
    settings.percent && document.capabilities.percentages && '割合帯',
    settings.cumulative && document.capabilities.cumulative && '累積割合',
    settings.cumulativeBand && document.capabilities.cumulative && '累積割合帯',
    settings.rankBand && document.capabilities.rankBands && Boolean(document.rankBands?.length) && '評価帯',
  ])
  return withChartImageAspect(filename, aspectRatio)
}

export function getBarChartComparisonBand(settings: BarChartDisplaySettings): 'cumulative' | 'rank' | 'none' {
  return settings.comparisonBand === 'rank' || settings.comparisonBand === 'none' ? settings.comparisonBand : 'cumulative'
}

/** Both series use one positive percentage scale; mirroring is a drawing operation only. */
export function getBarChartComparisonAxis(document: BarChartDocument) {
  return createZeroBasedValueAxis(Math.max(0, ...(document.series ?? []).flatMap(series =>
    series.bins.map(bin => bin.share === null || bin.share === undefined ? 0 : bin.share * 100))))
}

export function getBarChartSelectionSummary(document: BarChartDocument, selectedRanks: readonly string[]): {
  label: string
  series: { id: 'left' | 'right'; label: string; count: number; share: number | null }[]
} | null {
  if (document.layout !== 'mirrored' || !document.series) return null
  const selected = new Set(selectedRanks)
  const categories = document.bins.filter(bin => selected.has(bin.id))
  if (!categories.length) return null
  const ranges: { first: string; last: string }[] = []
  let range: { first: string; last: string } | undefined
  for (const bin of document.bins) {
    if (!selected.has(bin.id)) { range = undefined; continue }
    if (range) range.last = bin.label
    else { range = { first: bin.label, last: bin.label }; ranges.push(range) }
  }
  return {
    label: ranges.map(({ first, last }) => first === last ? first : `${first}〜${last}`).join('・'),
    series: document.series.map(series => {
      const count = series.bins.reduce((sum, bin) => sum + (selected.has(bin.id) ? bin.value ?? 0 : 0), 0)
      return { id: series.id, label: series.label, count, share: series.population.valid > 0 ? count / series.population.valid : null }
    }),
  }
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

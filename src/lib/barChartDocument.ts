import { createChartImageFilename, withChartImageAspect } from './chartImageFilename.ts'
import type { StatRankBand } from './statRankBands.ts'

export interface BarChartDisplaySettings {
  values: boolean
  axisBand: boolean
  percent: boolean
  cumulative: boolean
  cumulativeBand?: boolean
  rankBand?: boolean
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

export interface BarChartSemantics {
  readonly kind: 'histogram' | 'correspondence'
  readonly subject: string
  readonly xLabel: string
  readonly xUnit?: string
  readonly xQualifier?: string
  readonly xBandTitle?: string
  readonly yLabel: string
  readonly yUnit?: string
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
  readonly population: {
    readonly total: number
    readonly valid: number
    readonly missing: number
    readonly basis: 'single-stat' | 'paired-stats'
  }
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
  readonly xKind: 'interval' | 'point' | 'category'
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
    title: semantics.kind === 'histogram' ? `${semantics.subject}のヒストグラム`
      : `${semantics.yLabel}と${semantics.xLabel}の対応（${semantics.xLabel}別）`,
    xAxisTitle: `${semantics.xLabel}${xDetails ? `（${xDetails}）` : ''}`,
    yAxisTitle: `${yLabel}${semantics.yUnit ? `（${semantics.yUnit}）` : ''}`,
  }
}

const formatCount = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 12 })

export function getBarChartConditions(source: BarChartSource): string {
  return [
    source.aggregationVersion.label || `集計版 ${source.aggregationVersion.id}`,
    source.scopeLabel,
    `${source.countLabel} ${formatCount(source.population.valid)}${source.countUnit}`,
    source.population.missing > 0 ? `値なし ${formatCount(source.population.missing)}${source.countUnit}を除外` : '',
    source.population.basis === 'paired-stats' ? '防御力・術耐性の両方が有効' : '',
    source.coverageLabel,
    ...source.parameters.map(({ label, value }) => `${label} ${value}`),
  ].filter(Boolean).join(' · ')
}

type DocumentInput = Pick<BarChartDocument, 'xKind' | 'bins' | 'rankBands' | 'secondaryAxisBand' | 'filenameParts' | 'fractionDigits' | 'capabilities' | 'semantics' | 'source'>

/** Freeze a detached JSON snapshot so later source edits cannot change a preview or export. */
export function createBarChartDocument(input: DocumentInput): BarChartDocument {
  if (!Number.isInteger(input.fractionDigits) || input.fractionDigits < 0 || input.fractionDigits > 12
    || Object.values(input.source.population).some(value => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) {
    throw new Error('棒グラフの集計値を確認できませんでした。')
  }
  const ids = new Set<string>()
  for (const bin of input.bins) {
    if (!bin.id || ids.has(bin.id) || (bin.value !== null && !Number.isFinite(bin.value))
      || (bin.point !== undefined && !Number.isFinite(bin.point))
      || [bin.share, bin.cumulativeShare].some(value => value !== undefined && value !== null
        && (!Number.isFinite(value) || value < 0 || value > 1))
      || (input.xKind === 'point' && (bin.point === undefined || bin.interval !== undefined))
      || (input.xKind === 'interval' && (!bin.interval || bin.point !== undefined))
      || (bin.interval && ((bin.interval.start !== null && !Number.isFinite(bin.interval.start))
        || (bin.interval.end !== null && (!Number.isFinite(bin.interval.end)
          || (bin.interval.start !== null && bin.interval.end < bin.interval.start)))
        || typeof bin.interval.includesMinimum !== 'boolean' || typeof bin.interval.includesMaximum !== 'boolean'
        || (bin.interval.start === null && bin.interval.includesMinimum)
        || (bin.interval.end === null && bin.interval.includesMaximum)
        || (bin.interval.isOverflow !== (bin.interval.end === null))))) {
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
    ...getBarChartLabels(detached.semantics, detached.xKind), conditions: getBarChartConditions(detached.source) }
  let hash = 2166136261
  for (const character of JSON.stringify(content)) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0
  return freezeDeep({ ...content, id: `bar-chart-${hash.toString(16).padStart(8, '0')}` })
}

export function getBarChartFilename(document: BarChartDocument, settings: BarChartDisplaySettings, aspectRatio?: number): string {
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

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

import { getBarChartComparisonBand, getBarChartHighlightFilenamePart, type BarChartDocument, type BarChartDisplaySettings } from './barChartDocument.ts'
import { BAR_CHART_PROVIDERS, type BarChartProviderVariant } from './barChartProviders.ts'
import { createChartImageFilename, withChartImageAspect } from './chartImageFilename.ts'

export interface BarChartImageSnapshot {
  readonly document: BarChartDocument
  readonly settings: Readonly<BarChartDisplaySettings>
  readonly variants?: readonly BarChartProviderVariant[]
}

export interface BarChartImageVariant {
  readonly key: string
  readonly label: string
  readonly snapshot: BarChartImageSnapshot
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

/** The current graph and every alternative capture one source and display state. */
export function createBarChartImageSnapshot(document: BarChartDocument, settings: BarChartDisplaySettings,
  variants?: readonly BarChartProviderVariant[]): BarChartImageSnapshot {
  return freezeDeep(structuredClone({ document, settings, ...(variants ? { variants } : {}) }))
}

/** Preserve source order, not checkbox click order; unknown or repeated keys add no files. */
export function buildBarChartImageVariants(snapshot: BarChartImageSnapshot, keys: readonly string[]): readonly BarChartImageVariant[] {
  const selected = new Set(keys)
  return Object.freeze((snapshot.variants ?? []).filter(variant => selected.has(variant.key)).map(variant => Object.freeze({
    key: variant.key, label: variant.label,
    snapshot: Object.freeze({ document: variant.document, settings: snapshot.settings }),
  })))
}

export function getBarChartArchiveFilename(snapshot: BarChartImageSnapshot,
  variants: readonly BarChartImageVariant[], aspectRatio?: number): string {
  const documents = variants.map(variant => variant.snapshot.document)
  const first = documents[0] ?? snapshot.document
  const provider = BAR_CHART_PROVIDERS.find(provider => provider.id === first.source.providerId)
  const commonConditions = first.filenameParts.filter(part => documents.every(document => document.filenameParts.includes(part)))
  const { settings } = snapshot
  const mirrored = first.layout === 'mirrored'
  const band = mirrored ? getBarChartComparisonBand(settings, first) : 'none'
  const highlight = getBarChartHighlightFilenamePart(first, variants[0]?.snapshot.settings ?? settings, 'zip')
  const commonHighlight = highlight && variants.every(({ snapshot: variant }) =>
    getBarChartHighlightFilenamePart(variant.document, variant.settings, 'zip') === highlight)
  const display = first.layout === 'stacked-percent' ? [] : mirrored ? [
    band === 'value' && '数値帯', band === 'cumulative' && '累積割合帯', band === 'rank' && '階級割合帯',
  ] : [
    settings.values && '数値表示', settings.axisBand && '階級帯',
    settings.percent && documents.every(document => document.capabilities.percentages) && '割合帯',
    settings.cumulative && documents.every(document => document.capabilities.cumulative) && '累積割合',
    settings.cumulativeBand && documents.every(document => document.capabilities.cumulative) && '累積割合帯',
    settings.rankBand && documents.every(document => document.rankBands?.length) && '評価帯',
  ]
  const numericBinning = first.semantics.kind === 'histogram' && !first.secondaryAxisBand && '数値階級'
  const choices = first.source.providerId === 'enemy-stat-rating-comparison' && variants.length === snapshot.variants?.length
    ? ['全組み合わせ'] : variants.map(variant => variant.label)
  return withChartImageAspect(createChartImageFilename(provider?.label ?? `${first.semantics.subject}の棒グラフ`, [
    `${variants.length}枚`, numericBinning, ...commonConditions, ...choices, '幅1920px', ...display, commonHighlight && highlight,
  ]), aspectRatio).replace(/\.png$/i, '.zip')
}

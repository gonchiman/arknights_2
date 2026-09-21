import { getChartImageLayout, type ChartImageLayout } from './chartImageLayout.ts'

export type EnemyChartKind = 'HISTOGRAM' | 'ECDF' | 'BOX' | 'SCATTER' | 'INDIVIDUAL' | 'COMPARISON'

export interface EnemyComparisonImageSettings {
  seriesLabels: readonly string[]
  yAxis: 'COUNT' | 'PERCENT'
  scale: 'LINEAR' | 'LOG'
  binWidth: number | null
  upperBound: number | null
}

export type EnemyChartImageLayout = ChartImageLayout

export function getEnemyChartNaturalHeight(kind: EnemyChartKind, groupCount = 0): number {
  const groups = Number.isFinite(groupCount) ? Math.max(0, Math.floor(groupCount)) : 0
  return kind === 'BOX' || kind === 'INDIVIDUAL' ? 24 + Math.max(1, groups) * 70 : 334
}

/** Reserve readable chart space before fitting the complete image to its ratio. */
export function getEnemyChartImageLayout({
  kind,
  aspectRatio,
  groupCount = 0,
  chromeHeight,
}: {
  kind: EnemyChartKind
  aspectRatio?: number
  groupCount?: number
  chromeHeight?: number
}): EnemyChartImageLayout {
  return getChartImageLayout({ naturalChartHeight: getEnemyChartNaturalHeight(kind, groupCount), aspectRatio, chromeHeight })
}

const chartNames: Record<EnemyChartKind, string> = {
  HISTOGRAM: 'ヒストグラム',
  ECDF: '累積分布',
  BOX: '箱ひげ図',
  SCATTER: '散布図',
  INDIVIDUAL: '個別プロット',
  COMPARISON: '分布比較',
}

export function getEnemyChartImageFilename({
  kind,
  metricLabel,
  secondaryMetricLabel,
  scopeLabel,
  histogramSettings,
  ecdfGuides,
  comparisonSettings,
}: {
  kind: EnemyChartKind
  metricLabel: string
  secondaryMetricLabel?: string
  scopeLabel?: string
  histogramSettings?: { binWidth: number; upperBound: number }
  ecdfGuides?: { x: number | null; yPercent: number | null }
  comparisonSettings?: EnemyComparisonImageSettings
}): string {
  if (kind === 'COMPARISON') return getComparisonImageFilename(metricLabel, comparisonSettings)
  const metrics = [sanitizeFilenamePart(metricLabel) || 'ステータス']
  if (kind === 'SCATTER' && secondaryMetricLabel) {
    const secondary = sanitizeFilenamePart(secondaryMetricLabel)
    if (secondary) metrics.push(secondary)
  }
  const scope = (scopeLabel ?? '').trim().replace(/^全敵(?:\s*·\s*|$)/, '')
  const safeScope = sanitizeFilenamePart(scope)
  const settings = kind === 'HISTOGRAM' && histogramSettings
    && Number.isFinite(histogramSettings.binWidth) && histogramSettings.binWidth > 0
    && Number.isFinite(histogramSettings.upperBound) && histogramSettings.upperBound > 0
    ? histogramSettings : null
  const guideX = kind === 'ECDF' && ecdfGuides?.x != null
    && Number.isFinite(ecdfGuides.x) && ecdfGuides.x >= 0 ? ecdfGuides.x : null
  const guideYPercent = kind === 'ECDF' && ecdfGuides?.yPercent != null
    && Number.isFinite(ecdfGuides.yPercent) && ecdfGuides.yPercent >= 0 && ecdfGuides.yPercent <= 100
    ? ecdfGuides.yPercent : null
  const settingsSuffix = (settings ? `_幅${settings.binWidth}_上限${settings.upperBound}` : '')
    + (guideX !== null ? `_縦線${guideX}` : '')
    + (guideYPercent !== null ? `_横線${guideYPercent}pct` : '')
  const base = `敵_${metrics.join('_')}_${chartNames[kind]}${safeScope ? `_${safeScope}` : ''}`
  const encoder = new TextEncoder()
  if (safeScope !== scope || encoder.encode(`${base}${settingsSuffix}.png`).length > 200) {
    // Preserve distinctions lost through replacement or shortening, including the condition's tail.
    const identityParts: unknown[] = [kind, metricLabel, secondaryMetricLabel, scopeLabel]
    if (settings) identityParts.push(settings.binWidth, settings.upperBound)
    if (guideX !== null || guideYPercent !== null) identityParts.push('ecdfGuides', guideX, guideYPercent)
    const identity = JSON.stringify(identityParts)
    let hash = 2166136261
    for (let index = 0; index < identity.length; index += 1) {
      hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619)
    }
    const suffix = `${settingsSuffix}_${(hash >>> 0).toString(16).padStart(8, '0')}.png`
    let prefix = ''
    for (const character of base) {
      if (encoder.encode(prefix + character + suffix).length > 200) break
      prefix += character
    }
    return prefix + suffix
  }
  return `${base}${settingsSuffix}.png`
}

function getComparisonImageFilename(metricLabel: string, settings?: EnemyComparisonImageSettings): string {
  const metric = sanitizeFilenamePart(metricLabel) || 'ステータス'
  const labels = settings?.seriesLabels.map((label, index) => sanitizeFilenamePart(label) || `条件${index + 1}`) ?? []
  const binWidth = settings?.scale === 'LINEAR' && settings.binWidth !== null
    && Number.isFinite(settings.binWidth) && settings.binWidth > 0 ? settings.binWidth : null
  const upperBound = settings?.scale === 'LINEAR' && settings.upperBound !== null
    && Number.isFinite(settings.upperBound) && settings.upperBound > 0 ? settings.upperBound : null
  const settingsSuffix = settings
    ? `_${settings.yAxis === 'PERCENT' ? '割合' : '敵数'}_${settings.scale === 'LOG' ? '対数' : '線形'}`
      + (binWidth !== null ? `_幅${binWidth}` : '') + (upperBound !== null ? `_上限${upperBound}` : '')
    : ''
  const base = `敵_${metric}_${chartNames.COMPARISON}${labels.length ? `_${labels.join('_vs_')}` : ''}`
  const encoder = new TextEncoder()
  const altered = metric !== metricLabel || settings?.seriesLabels.some((label, index) => label !== labels[index] || label.includes('_'))
  if (altered || encoder.encode(`${base}${settingsSuffix}.png`).length > 200) {
    // Include complete ordered conditions even when a label's tail is absent from the readable name.
    const identity = JSON.stringify(['COMPARISON', metricLabel, settings?.seriesLabels,
      settings?.yAxis, settings?.scale, binWidth, upperBound])
    let hash = 2166136261
    for (let index = 0; index < identity.length; index += 1) {
      hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619)
    }
    const suffix = `${settingsSuffix}_${(hash >>> 0).toString(16).padStart(8, '0')}.png`
    let prefix = ''
    for (const character of base) {
      if (encoder.encode(prefix + character + suffix).length > 200) break
      prefix += character
    }
    return prefix + suffix
  }
  return `${base}${settingsSuffix}.png`
}

function sanitizeFilenamePart(value: string): string {
  return Array.from(value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim())
    .slice(0, 80).join('').replace(/[. ]+$/g, '')
}

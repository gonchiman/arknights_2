import { createChartImageFilename } from './chartImageFilename.ts'

export interface ChartImageLabelOverrides {
  title?: string
  xAxis?: string
  yAxis?: string
  series?: Record<string, string>
}

export interface ChartImageLabelDefaults {
  title: string
  xAxis: string
  yAxis: string
  series: readonly { id: string; label: string }[]
}

export const CHART_IMAGE_LABEL_MAX_LENGTH = 100

function displayLabel(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}

/** Resolve presentation text without changing the snapshot's series identities or data. */
export function resolveChartImageLabels(defaults: ChartImageLabelDefaults, overrides?: ChartImageLabelOverrides) {
  return {
    title: displayLabel(overrides?.title, defaults.title),
    xAxis: displayLabel(overrides?.xAxis, defaults.xAxis),
    yAxis: displayLabel(overrides?.yAxis, defaults.yAxis),
    seriesLabels: Object.fromEntries(defaults.series.map(item =>
      [item.id, displayLabel(overrides?.series?.[item.id], item.label)])),
  }
}

export function applyChartImageSeriesLabels<T extends { id: string; label: string }>(
  series: readonly T[], overrides?: ChartImageLabelOverrides,
): T[] {
  return series.map(item => ({ ...item, label: displayLabel(overrides?.series?.[item.id], item.label) }))
}

/** Add only active text changes to automatic names; the save dialog preserves manual filenames. */
export function withChartImageLabelFilename(
  filename: string, defaults: ChartImageLabelDefaults, overrides?: ChartImageLabelOverrides,
): string {
  const labels = resolveChartImageLabels(defaults, overrides)
  const parts = (['title', 'xAxis', 'yAxis'] as const).flatMap(key => labels[key] === defaults[key]
    ? [] : [`${{ title: 'タイトル', xAxis: '横軸', yAxis: '縦軸' }[key]}${labels[key]}`])
  for (const item of defaults.series) {
    if (labels.seriesLabels[item.id] !== item.label) parts.push(`凡例${item.label}-${labels.seriesLabels[item.id]}`)
  }
  return parts.length ? createChartImageFilename(filename.replace(/\.png$/i, ''), parts) : filename
}

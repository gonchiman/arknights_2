export type EnemyChartKind = 'HISTOGRAM' | 'ECDF' | 'BOX' | 'SCATTER' | 'INDIVIDUAL'

export interface EnemyChartImageLayout {
  width: number
  height: number
  chartHeight: number
}

/** Reserve readable chart space before fitting the complete image to its ratio. */
export function getEnemyChartImageLayout({
  kind,
  aspectRatio,
  groupCount = 0,
  chromeHeight = 76,
}: {
  kind: EnemyChartKind
  aspectRatio?: number
  groupCount?: number
  chromeHeight?: number
}): EnemyChartImageLayout {
  const groups = Number.isFinite(groupCount) ? Math.max(0, Math.floor(groupCount)) : 0
  const chrome = Number.isFinite(chromeHeight) && chromeHeight >= 0 ? Math.ceil(chromeHeight) : 76
  const rows = kind === 'BOX' || kind === 'INDIVIDUAL'
  const naturalChartHeight = rows ? 24 + Math.max(1, groups) * 70 : 334
  const validRatio = aspectRatio !== undefined && Number.isFinite(aspectRatio) && aspectRatio >= 0.01 && aspectRatio <= 100

  if (!validRatio) return { width: 960, height: naturalChartHeight + chrome, chartHeight: naturalChartHeight }

  // Widen short, panoramic images instead of squeezing rows or changing the
  // selected ratio. The shared exporter handles rasterization size limits.
  const minimumChartHeight = naturalChartHeight
  const width = Math.ceil(Math.max(960, (minimumChartHeight + chrome) * aspectRatio))
  const height = Math.ceil(width / aspectRatio)
  return { width, height, chartHeight: height - chrome }
}

const chartNames: Record<EnemyChartKind, string> = {
  HISTOGRAM: 'ヒストグラム',
  ECDF: '累積分布',
  BOX: '箱ひげ図',
  SCATTER: '散布図',
  INDIVIDUAL: '個別プロット',
}

export function getEnemyChartImageFilename({
  kind,
  metricLabel,
  secondaryMetricLabel,
}: {
  kind: EnemyChartKind
  metricLabel: string
  secondaryMetricLabel?: string
}): string {
  const metrics = [sanitizeFilenamePart(metricLabel) || 'ステータス']
  if (kind === 'SCATTER' && secondaryMetricLabel) {
    const secondary = sanitizeFilenamePart(secondaryMetricLabel)
    if (secondary) metrics.push(secondary)
  }
  return `敵_${metrics.join('_')}_${chartNames[kind]}.png`
}

function sanitizeFilenamePart(value: string): string {
  return Array.from(value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim())
    .slice(0, 80).join('').replace(/[. ]+$/g, '')
}

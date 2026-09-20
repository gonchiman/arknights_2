import { getChartImageLayout, type ChartImageLayout } from './chartImageLayout.ts'

export type EnemyChartKind = 'HISTOGRAM' | 'ECDF' | 'BOX' | 'SCATTER' | 'INDIVIDUAL'

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

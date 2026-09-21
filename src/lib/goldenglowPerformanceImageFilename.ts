import { createChartImageFilename } from './chartImageFilename.ts'
import type { GoldenglowComparisonBuild } from './goldenglowPerformanceComparison.ts'

export interface GoldenglowPerformanceImageFilenameOptions {
  skillIndex: number
  skillLevelIndex: number
  skillLevelLabel: string
  /** The skill duration, or the selected viewing duration for a permanent skill. */
  duration: number
  builds: readonly GoldenglowComparisonBuild[]
  baselineId: string
  chartType: 'line' | 'bar'
  chartMetric: 'total' | 'difference' | 'ratio' | 'growth'
  chartDigits: number
  lineStyle: 'solid' | 'dashed'
  showLineEndLabels: boolean
  yAxisFromZero: boolean
  barMode: 'single' | 'grouped'
  showGroupedBarValues: boolean
  groupedResistanceStep: number
  stackedBars: boolean
  barOrientation: 'vertical' | 'horizontal'
  barVariant: 'axis' | 'label' | 'detail'
  chartResistance: number
}

/** Identifies the active chart settings; the save dialog adds the image aspect. */
export function getGoldenglowPerformanceImageFilename(options: GoldenglowPerformanceImageFilenameOptions): Promise<string> {
  const builds = options.builds.map((build) => ({
    moduleId: build.moduleId,
    moduleLevel: build.moduleId ? build.moduleLevel : null,
    potential: build.potential,
  }))
  const baselineIndex = Math.max(0, options.builds.findIndex((build) => build.id === options.baselineId))
  const relative = options.chartMetric !== 'total'
  const percentage = options.chartMetric === 'ratio' || options.chartMetric === 'growth'
  const grouped = options.chartType === 'bar' && options.barMode === 'grouped'
  const single = options.chartType === 'bar' && !grouped
  const chartKind = grouped ? 'grouped-bar' : single && options.stackedBars ? 'stacked' : options.chartType
  const details = grouped
    ? `-step${options.groupedResistanceStep}${options.showGroupedBarValues ? '-value-labels' : ''}`
    : single ? `-${options.barOrientation}-${options.barVariant}-res${options.chartResistance}`
    : options.showLineEndLabels ? '-end-labels' : ''
  const durationLabel = new Intl.NumberFormat('ja-JP', { useGrouping: false, maximumFractionDigits: 3 }).format(options.duration)
  const prefix = `goldenglow-S${options.skillIndex}-${options.skillLevelLabel}-${durationLabel}s-${chartKind}${relative ? `-${options.chartMetric}` : ''}${details}`

  return createChartImageFilename(prefix, {
    skillIndex: options.skillIndex,
    skillLevelIndex: options.skillLevelIndex,
    skillLevelLabel: options.skillLevelLabel,
    duration: options.duration,
    builds,
    chartMetric: options.chartMetric,
    chartDigits: options.chartDigits,
    baseline: relative && builds.length > 0 ? { index: baselineIndex, build: builds[baselineIndex] } : null,
    chart: options.chartType === 'line' ? {
      type: 'line',
      lineStyle: options.lineStyle,
      showEndLabels: options.showLineEndLabels,
      yAxisFromZero: percentage ? options.yAxisFromZero : true,
    } : grouped ? {
      type: 'grouped-bar',
      resistanceStep: options.groupedResistanceStep,
      showValues: options.showGroupedBarValues,
    } : {
      type: 'bar',
      resistance: options.chartResistance,
      stacked: options.stackedBars,
      orientation: options.barOrientation,
      variant: options.barVariant,
    },
  })
}

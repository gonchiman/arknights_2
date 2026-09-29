import { createChartImageFilename } from './chartImageFilename.ts'
import type { GoldenglowComparisonBuild } from './goldenglowPerformanceComparison.ts'
import { buildGoldenglowResistanceValues } from './goldenglowPerformanceComparison.ts'
import { formatChartFilenameValues } from './chartImageFilename.ts'
import { formatGoldenglowImageBaseline, formatGoldenglowImageBuild, goldenglowImageMetrics } from './goldenglowChartImageFilename.ts'

export interface GoldenglowPerformanceImageFilenameOptions {
  skillIndex: number
  skillLevelIndex: number
  skillLevelLabel: string
  /** The skill duration, or the selected viewing duration for a permanent skill. */
  duration: number
  builds: readonly (GoldenglowComparisonBuild & { moduleType?: string | null })[]
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
export function getGoldenglowPerformanceImageFilename(options: GoldenglowPerformanceImageFilenameOptions): string {
  const builds = options.builds.map(build => ({ ...build, moduleLevel: build.moduleId ? build.moduleLevel : undefined }))
  const relative = options.chartMetric !== 'total'
  const percentage = options.chartMetric === 'ratio' || options.chartMetric === 'growth'
  const grouped = options.chartType === 'bar' && options.barMode === 'grouped'
  const single = options.chartType === 'bar' && !grouped
  const chartKind = grouped ? '集合棒' : single
    ? `${options.stackedBars ? '積上げ' : ''}${options.barOrientation === 'horizontal' ? '横棒' : '縦棒'}` : '折れ線'
  return createChartImageFilename('GG', [
    `S${options.skillIndex}${options.skillLevelLabel}`,
    goldenglowImageMetrics[options.chartMetric],
    `MOD${builds.map(formatGoldenglowImageBuild).join('-')}`,
    `${options.duration}秒`,
    single ? `術耐性${options.chartResistance}` : grouped
      ? `術耐性${formatChartFilenameValues(buildGoldenglowResistanceValues(options.groupedResistanceStep))}` : '術耐性0-100',
    chartKind,
    relative && formatGoldenglowImageBaseline(builds, options.baselineId),
    options.chartDigits > 0 && `小数${options.chartDigits}桁`,
    options.chartType === 'line' && options.lineStyle === 'dashed' && '破線',
    options.chartType === 'line' && options.showLineEndLabels && '末尾ラベル',
    options.chartType === 'line' && percentage && (options.yAxisFromZero ? 'Y軸0始まり' : 'Y軸自動'),
    grouped && options.showGroupedBarValues && '数値あり',
    single && ({ axis: '軸あり', label: 'ラベル', detail: '詳細' } as const)[options.barVariant],
  ])
}

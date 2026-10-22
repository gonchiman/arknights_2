import { CategoryGroupedBarImagePreview } from './CategoryGroupedBarImagePreview'
import { getGoldenglowGroupedBarChartProps, type GoldenglowPerformanceGroupedBarChartProps } from './GoldenglowPerformanceGroupedBarChart'

export function GoldenglowGroupedBarImagePreview({ chartProps, aspectRatio }: {
  chartProps: GoldenglowPerformanceGroupedBarChartProps
  aspectRatio?: number
}) {
  return <CategoryGroupedBarImagePreview chartProps={getGoldenglowGroupedBarChartProps(chartProps)} aspectRatio={aspectRatio} />
}

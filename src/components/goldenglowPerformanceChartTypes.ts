import type { GoldenglowPerformanceComparisonValue } from '../lib/goldenglowPerformanceComparison'

export interface GoldenglowPerformanceChartColumn {
  id: string
  label: string
  color: string
  values: readonly GoldenglowPerformanceComparisonValue[]
}

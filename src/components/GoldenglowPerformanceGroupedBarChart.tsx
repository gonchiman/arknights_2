import type { GoldenglowPerformanceChartColumn } from './goldenglowPerformanceChartTypes'
import { CategoryGroupedBarChart, type CategoryGroupedBarChartProps } from './CategoryGroupedBarChart'

export interface GoldenglowPerformanceGroupedBarChartProps extends Omit<CategoryGroupedBarChartProps, 'groups' | 'legend' | 'categoryAxisLabel'> {
  columns: readonly GoldenglowPerformanceChartColumn[]
  resistances: readonly number[]
}

/** Preserve the resistance-based API while sharing the categorical renderer. */
export function getGoldenglowGroupedBarChartProps({ columns, resistances, ...props }: GoldenglowPerformanceGroupedBarChartProps): CategoryGroupedBarChartProps {
  return {
    ...props,
    categoryAxisLabel: '敵の術耐性',
    legend: columns,
    groups: resistances.map((resistance) => ({
      id: String(resistance),
      label: String(resistance),
      bars: columns.map((column) => ({
        id: column.id,
        label: column.label,
        color: column.color,
        value: column.values.find((value) => value.resistance === resistance)?.expectedTotalDamage ?? null,
      })),
    })),
  }
}

export function GoldenglowPerformanceGroupedBarChart(props: GoldenglowPerformanceGroupedBarChartProps) {
  return <CategoryGroupedBarChart {...getGoldenglowGroupedBarChartProps(props)} />
}

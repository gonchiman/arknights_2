import { CHART_IMAGE_DEFAULT_CHROME_HEIGHT, getChartImageLayout } from './chartImageLayout.ts'

/** Standard shared heading: 12px top padding plus the 22px title line. */
export const CHART_IMAGE_STACK_HEADER_HEIGHT = 34

export interface ChartImageStackPanelSize {
  naturalChartHeight: number
  chromeHeight?: number
  overflow?: number
  minimumChartHeight?: number
}

export interface ChartImageStackLayout {
  width: number
  height: number
  gap: number
  panels: { height: number; chartHeight: number }[]
}

function nonNegative(value: number | undefined, fallback = 0) {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.ceil(value) : fallback
}

/** Apply a ratio once to the whole stack, retaining every panel's natural plot height. */
export function getChartImageStackLayout({ panels, aspectRatio, gap = 12, headerHeight = 0 }: {
  panels: ChartImageStackPanelSize[]
  aspectRatio?: number
  gap?: number
  headerHeight?: number
}): ChartImageStackLayout {
  const spacing = nonNegative(gap, 12)
  const header = nonNegative(headerHeight)
  const sizes = panels.map((panel) => ({
    chromeHeight: Math.max(CHART_IMAGE_DEFAULT_CHROME_HEIGHT, nonNegative(panel.chromeHeight)),
    chartHeight: Math.max(Number.isFinite(panel.naturalChartHeight) && panel.naturalChartHeight > 0
      ? Math.ceil(panel.naturalChartHeight) + nonNegative(panel.overflow) : 334 + nonNegative(panel.overflow),
    nonNegative(panel.minimumChartHeight)),
  }))
  if (!sizes.length) return { width: 960, height: header, gap: spacing, panels: [] }
  const naturalChartHeight = sizes.reduce((sum, panel) => sum + panel.chartHeight, 0)
  const chromeHeight = header + sizes.reduce((sum, panel) => sum + panel.chromeHeight, 0) + Math.max(0, sizes.length - 1) * spacing
  const layout = getChartImageLayout({ naturalChartHeight, chromeHeight, aspectRatio })
  const extraHeight = layout.chartHeight - naturalChartHeight
  const eachExtra = Math.floor(extraHeight / sizes.length)
  return {
    width: layout.width,
    height: layout.height,
    gap: spacing,
    panels: sizes.map((panel, index) => {
      const chartHeight = panel.chartHeight + eachExtra + (index === sizes.length - 1 ? extraHeight % sizes.length : 0)
      return { height: chartHeight + panel.chromeHeight, chartHeight }
    }),
  }
}

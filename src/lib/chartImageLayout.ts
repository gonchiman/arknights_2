import type { TableImageAspect } from './tableImageAspect.ts'

export interface ChartImageLayout {
  width: number
  height: number
  chartHeight: number
}

export const CHART_IMAGE_DEFAULT_CHROME_HEIGHT = 76

/** Keep the plot readable before fitting the complete image to its ratio. */
export function getChartImageLayout({
  naturalChartHeight,
  aspectRatio,
  exactAspect,
  chromeHeight = CHART_IMAGE_DEFAULT_CHROME_HEIGHT,
}: {
  naturalChartHeight: number
  aspectRatio?: number
  exactAspect?: TableImageAspect
  chromeHeight?: number
}): ChartImageLayout {
  const chartHeight = Number.isFinite(naturalChartHeight) && naturalChartHeight > 0 ? Math.ceil(naturalChartHeight) : 334
  const chrome = Number.isFinite(chromeHeight) && chromeHeight >= 0 ? Math.ceil(chromeHeight) : CHART_IMAGE_DEFAULT_CHROME_HEIGHT
  if (exactAspect) {
    const scale = Math.ceil(Math.max(960 / exactAspect.width, (chartHeight + chrome) / exactAspect.height))
    const height = scale * exactAspect.height
    return { width: scale * exactAspect.width, height, chartHeight: height - chrome }
  }
  const validRatio = aspectRatio !== undefined && Number.isFinite(aspectRatio) && aspectRatio >= 0.01 && aspectRatio <= 100

  if (!validRatio) return { width: 960, height: chartHeight + chrome, chartHeight }

  // Panoramic images grow wider instead of squeezing the plot or its rows.
  // The PNG exporter applies rasterization size limits afterwards.
  const width = Math.ceil(Math.max(960, (chartHeight + chrome) * aspectRatio))
  const height = Math.ceil(width / aspectRatio)
  return { width, height, chartHeight: height - chrome }
}

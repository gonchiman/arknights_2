import type { BarChartDisplaySettings, BarChartDocument } from './barChartDocument.ts'

export const BAR_CHART_NATURAL_HEIGHT = 334
export const BAR_CHART_BAND_HEIGHT = 24
export const BAR_CHART_BAND_GAP = 4

/** Reserve new rows without reducing the natural data area or retaining hidden rows. */
export function getBarChartNaturalHeight(document: BarChartDocument, settings: BarChartDisplaySettings): number {
  const cumulative = settings.cumulativeBand && document.capabilities.cumulative
  const rank = settings.rankBand && document.capabilities.rankBands && document.rankBands?.length
  return BAR_CHART_NATURAL_HEIGHT + (Number(Boolean(cumulative)) + Number(Boolean(rank)))
    * (BAR_CHART_BAND_HEIGHT + BAR_CHART_BAND_GAP)
}

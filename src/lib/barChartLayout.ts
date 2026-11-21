import { getBarChartSelectionSummary, type BarChartDisplaySettings, type BarChartDocument } from './barChartDocument.ts'

export const BAR_CHART_NATURAL_HEIGHT = 334
export const BAR_CHART_BAND_HEIGHT = 24
export const BAR_CHART_BAND_GAP = 4
export const BAR_CHART_SECONDARY_AXIS_HEIGHT = 38
export const BAR_CHART_MIRRORED_HEADER_HEIGHT = 62
export const BAR_CHART_MIRRORED_ROW_HEIGHT = 32
export const BAR_CHART_MIRRORED_SELECTION_HEIGHT = 40
export const BAR_CHART_MIRRORED_BOTTOM_HEIGHT = 2

/** Reserve new rows without reducing the natural data area or retaining hidden rows. */
export function getBarChartNaturalHeight(document: BarChartDocument, settings: BarChartDisplaySettings): number {
  if (document.layout === 'mirrored') {
    return BAR_CHART_MIRRORED_HEADER_HEIGHT + Math.max(1, document.bins.length) * BAR_CHART_MIRRORED_ROW_HEIGHT
      + (getBarChartSelectionSummary(document, settings.selectedRanks ?? []) ? BAR_CHART_MIRRORED_SELECTION_HEIGHT : 0)
      + BAR_CHART_MIRRORED_BOTTOM_HEIGHT
  }
  const cumulative = settings.cumulativeBand && document.capabilities.cumulative
  const rank = settings.rankBand && document.capabilities.rankBands && document.rankBands?.length
  const secondary = settings.axisBand && document.secondaryAxisBand
  return BAR_CHART_NATURAL_HEIGHT + (Number(Boolean(cumulative)) + Number(Boolean(rank)))
    * (BAR_CHART_BAND_HEIGHT + BAR_CHART_BAND_GAP)
    + (secondary ? BAR_CHART_SECONDARY_AXIS_HEIGHT + BAR_CHART_BAND_GAP : 0)
}

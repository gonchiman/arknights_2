export type SurtrComparisonImageNumberSize = 'auto' | '100' | '150' | '200'

export const SURTR_COMPARISON_IMAGE_NUMBER_BASE_SIZE = 14

export interface SurtrComparisonImageNumberCell {
  availableWidth: number
  availableHeight: number
  /** Actual formatted text dimensions measured at the base 14px size. */
  textWidth: number
  textHeight: number
}

/** Keep all numeric cells at one size, constrained by the least spacious cell. */
export function getSurtrComparisonImageNumberFontSize(
  mode: SurtrComparisonImageNumberSize | undefined,
  cells: readonly SurtrComparisonImageNumberCell[],
): number {
  const base = SURTR_COMPARISON_IMAGE_NUMBER_BASE_SIZE
  if (mode === undefined || mode === '100' || cells.length === 0) return base
  const maximum = mode === '150' ? 21 : mode === 'auto' || mode === '200' ? 28 : base
  let size = maximum
  for (const cell of cells) {
    if (![cell.availableWidth, cell.availableHeight, cell.textWidth, cell.textHeight].every(Number.isFinite)
      || cell.availableWidth <= 0 || cell.availableHeight <= 0 || cell.textWidth < 0 || cell.textHeight <= 0) return base
    // Leave a small margin for fractional borders and font-size rasterization.
    if (cell.textWidth > 0) size = Math.min(size, base * Math.max(0, cell.availableWidth - 2) / cell.textWidth)
    size = Math.min(size, base * Math.max(0, cell.availableHeight - 2) / cell.textHeight)
  }
  return Math.max(base, Math.floor(size * 10) / 10)
}

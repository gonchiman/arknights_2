export type ComparisonTableNumberSize = 'auto' | '100' | '150' | '200'

export interface ComparisonTableImageTypography {
  numberSize: ComparisonTableNumberSize
  titleSize: number
  detailSize: number
}

export const DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY: ComparisonTableImageTypography = {
  numberSize: 'auto', titleSize: 12, detailSize: 8,
}
export const COMPARISON_TABLE_IMAGE_NUMBER_BASE_SIZE = 14
export const COMPARISON_TABLE_TITLE_SIZES = [10, 12, 14, 16] as const
export const COMPARISON_TABLE_DETAIL_SIZES = [8, 9, 10, 12] as const

export interface ComparisonTableNumberCell {
  availableWidth: number
  availableHeight: number
  textWidth: number
  textHeight: number
}

/** All values use the same font size, limited by the least spacious cell. */
export function getComparisonTableNumberFontSize(
  mode: ComparisonTableNumberSize | undefined,
  cells: readonly ComparisonTableNumberCell[],
): number {
  const base = COMPARISON_TABLE_IMAGE_NUMBER_BASE_SIZE
  if (mode === undefined || mode === '100' || cells.length === 0) return base
  let size = mode === '150' ? 21 : mode === 'auto' || mode === '200' ? 28 : base
  for (const cell of cells) {
    if (![cell.availableWidth, cell.availableHeight, cell.textWidth, cell.textHeight].every(Number.isFinite)
      || cell.availableWidth <= 0 || cell.availableHeight <= 0 || cell.textWidth < 0 || cell.textHeight <= 0) return base
    if (cell.textWidth > 0) size = Math.min(size, base * Math.max(0, cell.availableWidth - 2) / cell.textWidth)
    size = Math.min(size, base * Math.max(0, cell.availableHeight - 2) / cell.textHeight)
  }
  return Math.max(base, Math.floor(size * 10) / 10)
}

export function normalizeComparisonTableTypography(
  value: Partial<ComparisonTableImageTypography> = {},
): ComparisonTableImageTypography {
  return {
    numberSize: ['auto', '100', '150', '200'].includes(value.numberSize ?? '')
      ? value.numberSize! : DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY.numberSize,
    titleSize: COMPARISON_TABLE_TITLE_SIZES.some(size => size === value.titleSize)
      ? value.titleSize! : DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY.titleSize,
    detailSize: COMPARISON_TABLE_DETAIL_SIZES.some(size => size === value.detailSize)
      ? value.detailSize! : DEFAULT_COMPARISON_TABLE_IMAGE_TYPOGRAPHY.detailSize,
  }
}

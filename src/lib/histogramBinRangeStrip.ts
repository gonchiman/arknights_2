export interface HistogramBinRangeStripLayout {
  labels: string[][]
  height: 24 | 40
}

const CELL_HORIZONTAL_PADDING = 6

/** Conservative widths until the strip's actual browser font is available. */
function estimateTextWidth(text: string): number {
  return Array.from(text).reduce((width, character) => width + (/^[\x20-\x7e]$/.test(character) ? 7 : 11), 0)
}

/** Keeps every numeric range inside its own histogram slot, or leaves the existing ticks in place. */
export function getHistogramBinRangeStripLayout(
  labels: readonly (readonly string[])[],
  plotWidth: number,
  measureText: (text: string) => number = estimateTextWidth,
): HistogramBinRangeStripLayout | null {
  if (!labels.length || !Number.isFinite(plotWidth) || plotWidth <= 0
    || labels.some(lines => !lines.length || lines.length > 2 || lines.some(line => !line.trim()))) return null

  const availableWidth = plotWidth / labels.length - CELL_HORIZONTAL_PADDING
  const fits = (text: string) => {
    const width = measureText(text)
    return Number.isFinite(width) && width >= 0 && width <= availableWidth
  }
  const singleLines = labels.map(lines => [lines.join('')])
  if (singleLines.every(([line]) => fits(line))) return { labels: singleLines, height: 24 }
  if (labels.every(lines => lines.every(fits))) return { labels: labels.map(lines => [...lines]), height: 40 }
  return null
}

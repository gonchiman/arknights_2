export interface HistogramBinRangeStripLayout {
  labels: string[][]
  height: 24 | 40 | 56
}

const CELL_HORIZONTAL_PADDING = 6

/** Conservative widths until the strip's actual browser font is available. */
function estimateTextWidth(text: string): number {
  return Array.from(text).reduce((width, character) => width + (/^[\x20-\x7e]$/.test(character) ? 7 : 11), 0)
}

/** Break at the range sign, keeping each formatted number intact. */
export function getHistogramBinRangeWrappedLines(lines: readonly string[]): string[] {
  const joined = lines.join('')
  const range = /^(.+?)([〜～])(.+)$/.exec(joined)
  if (range) return [range[1], range[2], range[3]]
  const bound = /^(.+)(超|以下)$/.exec(joined)
  return bound ? [bound[1], bound[2]] : [...lines]
}

/** Adds a third horizontal line before falling back for a number wider than its slot. */
export function getHistogramBinRangeStripLayout(
  labels: readonly (readonly string[])[],
  plotWidth: number,
  measureText: (text: string) => number = estimateTextWidth,
  preferTwoLines = false,
): HistogramBinRangeStripLayout | null {
  if (!labels.length || !Number.isFinite(plotWidth) || plotWidth <= 0
    || labels.some(lines => !lines.length || lines.length > 2 || lines.some(line => !line.trim()))) return null

  const availableWidth = plotWidth / labels.length - CELL_HORIZONTAL_PADDING
  const fits = (text: string) => {
    const width = measureText(text)
    return Number.isFinite(width) && width >= 0 && width <= availableWidth
  }
  const singleLines = labels.map(lines => [lines.join('')])
  if (!preferTwoLines && singleLines.every(([line]) => fits(line))) return { labels: singleLines, height: 24 }
  if (labels.every(lines => lines.every(fits))) return { labels: labels.map(lines => [...lines]), height: 40 }
  const wrappedLines = labels.map(getHistogramBinRangeWrappedLines)
  if (wrappedLines.every(lines => lines.every(fits))) {
    return { labels: wrappedLines, height: wrappedLines.some(lines => lines.length === 3) ? 56 : 40 }
  }
  return null
}

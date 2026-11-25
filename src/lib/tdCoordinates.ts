const rankDigits = '〇一二三四五六七八九'

export function tdFile(columns: number, col: number): number {
  return columns - col
}

export function tdRank(displayRow: number): string {
  const rank = displayRow + 1
  if (rank < 1 || rank > 99) return String(rank)
  if (rank < 10) return rankDigits[rank]
  const tens = Math.floor(rank / 10)
  return (tens === 1 ? '' : rankDigits[tens]) + '十' + (rank % 10 ? rankDigits[rank % 10] : '')
}

/** Accepts zero-based screen coordinates, measured from the top left. */
export function formatTdCell(columns: number, displayRow: number, col: number): string {
  return `${tdFile(columns, col)}筋${tdRank(displayRow)}段`
}

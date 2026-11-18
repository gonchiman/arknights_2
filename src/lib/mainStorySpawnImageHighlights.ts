import type { MainStorySpawnSortKey } from './mainStoryEnemySpawns.ts'
import { getMainStorySpawnImageRange, isMainStorySpawnImageRangeTooTall } from './mainStorySpawnImageRange.ts'

export type MainStorySpawnImageColumnKey = 'rowNumber' | 'rank' | MainStorySpawnSortKey

export interface MainStorySpawnImageHighlights {
  rows: readonly number[]
  columns: readonly MainStorySpawnImageColumnKey[]
}

export function parseMainStorySpawnImageHighlightRows(
  input: string, range: { start: number; end: number },
): number[] | null {
  const normalized = input.normalize('NFKC').trim()
  if (!normalized) return []
  if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
    || range.start < 1 || range.end < range.start) return null

  const intervals: { start: number; end: number }[] = []
  for (const token of normalized.split(/[,、]/)) {
    const match = /^(\d+)(?:\s*[-〜–~]\s*(\d+))?$/.exec(token.trim())
    if (!match) return null
    const selected = getMainStorySpawnImageRange(match[1], match[2] ?? match[1], range.end)
    if (!selected || selected.start < range.start) return null
    intervals.push(selected)
  }
  intervals.sort((left, right) => left.start - right.start)

  const merged: { start: number; end: number }[] = []
  for (const interval of intervals) {
    const previous = merged.at(-1)
    if (previous && interval.start - 1 <= previous.end) previous.end = Math.max(previous.end, interval.end)
    else merged.push({ ...interval })
  }
  const count = merged.reduce((total, interval) => total + (interval.end - interval.start + 1), 0)
  // Reject oversized selections before expanding them, using the existing image-row limit.
  if (!Number.isSafeInteger(count) || isMainStorySpawnImageRangeTooTall({ start: 1, end: count })) return null

  const rows: number[] = []
  for (const interval of merged) {
    for (let offset = 0; offset <= interval.end - interval.start; offset += 1) rows.push(interval.start + offset)
  }
  return rows
}

export function formatMainStorySpawnImageHighlightRows(rows: readonly number[]): string {
  const sorted = [...new Set(rows.filter(row => Number.isSafeInteger(row) && row > 0))].sort((a, b) => a - b)
  const groups: string[] = []
  let index = 0
  while (index < sorted.length) {
    const start = sorted[index]
    let end = start
    index += 1
    while (index < sorted.length && sorted[index] - end === 1) {
      end = sorted[index]
      index += 1
    }
    groups.push(start === end ? String(start) : `${start}〜${end}`)
  }
  return groups.join('・')
}

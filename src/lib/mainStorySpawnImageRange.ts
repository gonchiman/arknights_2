import { CHART_IMAGE_MAX_SIDE } from './chartImageRasterSize.ts'

interface MainStorySpawnImageRange {
  start: number
  end: number
}

export const MAIN_STORY_SPAWN_IMAGE_ROW_MIN_HEIGHT = 24

export function getMainStorySpawnImageRange(
  startInput: string, endInput: string, totalRows: number,
): MainStorySpawnImageRange | null {
  const inputs = [startInput.trim(), endInput.trim()]
  if (inputs.some(input => !/^\d+$/.test(input))) return null
  const [start, end] = inputs.map(Number)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 1 || end < start || end > totalRows) return null
  return { start, end }
}

export function isMainStorySpawnImageRangeTooTall({ start, end }: MainStorySpawnImageRange): boolean {
  // Reject ranges whose data rows alone exceed the shared 2× PNG height limit.
  // The common image frame still measures the complete table and the chosen ratio.
  return (end - start + 1) * MAIN_STORY_SPAWN_IMAGE_ROW_MIN_HEIGHT * 2 > CHART_IMAGE_MAX_SIDE
}

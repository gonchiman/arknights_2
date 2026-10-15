import { getModuleColorKey } from './moduleColors.ts'

export interface ModuleTableWinnerCandidate {
  id: string
  label: string
  shortLabel?: string
  moduleType: string | null | undefined
  moduleLevel?: number
  color?: string
  /** Unrounded absolute damage or DPS; missing candidates invalidate the comparison. */
  value: number | null
}

export interface ModuleTableWinnerResult {
  winners: ModuleTableWinnerCandidate[]
  runnerUpValue: number | null
  absoluteDifference: number | null
  increasePercent: number | null
}

export const MODULE_TABLE_WINNER_GAP_MAX_PERCENT = 30

/** Keep every tied maximum, using only a floating-point roundoff tolerance. */
export function getModuleTableWinner(
  candidates: readonly ModuleTableWinnerCandidate[],
): ModuleTableWinnerResult | null {
  if (!candidates.length || candidates.some(candidate => typeof candidate.id !== 'string' || !candidate.id.trim()
    || typeof candidate.label !== 'string' || typeof candidate.value !== 'number'
    || !Number.isFinite(candidate.value) || candidate.value < 0)
    || new Set(candidates.map(candidate => candidate.id)).size !== candidates.length) return null
  let maximumIndex = 0
  for (let index = 1; index < candidates.length; index += 1) {
    if (candidates[index].value! > candidates[maximumIndex].value!) maximumIndex = index
  }
  const maximum = candidates[maximumIndex].value!
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(maximum)) * 8
  const winners = candidates.filter(candidate => maximum - candidate.value! <= tolerance)
  if (candidates.length === 1) return { winners, runnerUpValue: null, absoluteDifference: null, increasePercent: null }
  let runnerUpValue = 0
  candidates.forEach((candidate, index) => {
    if (index !== maximumIndex) runnerUpValue = Math.max(runnerUpValue, candidate.value!)
  })
  const absoluteDifference = winners.length > 1 ? 0 : maximum - runnerUpValue
  const percent = absoluteDifference === 0 ? 0 : runnerUpValue === 0 ? null : absoluteDifference / runnerUpValue * 100
  return { winners, runnerUpValue, absoluteDifference,
    increasePercent: percent !== null && Number.isFinite(percent) ? percent : null }
}

/** Prefer explicit compact labels; never infer a module identity from a display name. */
export function formatModuleTableWinnerShortLabel(candidate: ModuleTableWinnerCandidate): string {
  if (candidate.shortLabel?.trim()) return candidate.shortLabel
  const key = getModuleColorKey(candidate.moduleType)
  if (key === 'none') return '未装備'
  if (key === 'unknown') return candidate.label
  const symbol = { X: 'X', Y: 'Y', D: 'Δ', A: 'α', B: 'β' }[key]
  return Number.isInteger(candidate.moduleLevel) && candidate.moduleLevel! >= 1 && candidate.moduleLevel! <= 3
    ? `${symbol}${candidate.moduleLevel}` : candidate.label
}

import { createDefaultSurtrDpsPageState, parseSurtrDpsPageState, type SurtrDpsPageState } from './surtrDpsPageState.ts'

export const SURTR_SKILL_COMPARISON_STATE_KEY = 'arknights-surtr-skill-comparison-state-v1'

export type SurtrSkillComparisonPageState = Pick<SurtrDpsPageState,
  'settings' | 'excluded' | 'moduleLevels' | 'resistanceRange' | 'barStep'> & {
  s2LevelIndex: number
  enemyCount: number
}

export function parseSurtrSkillComparisonPageState(value: unknown): SurtrSkillComparisonPageState {
  const defaults = createDefaultSurtrDpsPageState()
  const common = parseSurtrDpsPageState(value, defaults)
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const integer = (candidate: unknown, min: number, max: number, fallback: number): number =>
    typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= min && candidate <= max ? candidate : fallback
  return {
    settings: common.settings, excluded: common.excluded, moduleLevels: common.moduleLevels,
    resistanceRange: common.resistanceRange, barStep: common.barStep,
    s2LevelIndex: integer(source.s2LevelIndex, 0, 9, 9), enemyCount: integer(source.enemyCount, 1, 4, 1),
  }
}

export function readSurtrSkillComparisonPageState(storage: Pick<Storage, 'getItem'> | undefined = availableStorage()): SurtrSkillComparisonPageState {
  try {
    const saved = storage?.getItem(SURTR_SKILL_COMPARISON_STATE_KEY)
    return parseSurtrSkillComparisonPageState(saved ? JSON.parse(saved) : null)
  } catch {
    return parseSurtrSkillComparisonPageState(null)
  }
}

export function writeSurtrSkillComparisonPageState(state: SurtrSkillComparisonPageState,
  storage: Pick<Storage, 'setItem'> | undefined = availableStorage()): void {
  try { storage?.setItem(SURTR_SKILL_COMPARISON_STATE_KEY, JSON.stringify(parseSurtrSkillComparisonPageState(state))) } catch {
    // Calculation remains available when session storage is restricted.
  }
}

function availableStorage(): Storage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage } catch { return undefined }
}

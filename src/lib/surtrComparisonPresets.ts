import { getSelectedSurtrModuleStages, type SurtrModuleChoice } from './surtrModuleComparison.ts'

export interface SurtrModulePresetSelection {
  includeNone: boolean
  moduleLevels: Record<string, number[]>
}

export interface SurtrComparisonPreset {
  id: string
  name: string
  selection: SurtrModulePresetSelection
}

export const SURTR_COMPARISON_PRESETS_KEY = 'arknights-surtr-comparison-presets-v1'

const levelsInOrder = (levels: readonly number[]) => [...new Set(levels.filter(level => Number.isInteger(level) && level >= 1 && level <= 3))].sort((a, b) => a - b)

/** Build the available comparison patterns from the same modules and stages as the checkboxes. */
export function buildSurtrComparisonPresets(choices: readonly SurtrModuleChoice[]): SurtrComparisonPreset[] {
  const modules = choices.filter(choice => choice.id && levelsInOrder(choice.levels).length > 0)
  if (!modules.length) return []
  const make = (id: string, name: string, select: (choice: SurtrModuleChoice) => number[]): SurtrComparisonPreset => ({
    id, name, selection: { includeNone: true,
      moduleLevels: Object.fromEntries(modules.map(choice => [choice.id, select(choice)])),
    },
  })
  const maximumLevels = [...new Set(modules.map(choice => levelsInOrder(choice.levels).at(-1)!))]
  return [
    make('module-comparison', maximumLevels.length === 1 ? `MOD比較（Lv.${maximumLevels[0]}）` : 'MOD比較（最大段階）',
      choice => [levelsInOrder(choice.levels).at(-1)!]),
    ...(['X', 'Y'] as const).flatMap(type => modules.some(choice => choice.type === type)
      ? [make(`${type.toLowerCase()}-stages`, `${type}段階比較`, choice => choice.type === type ? levelsInOrder(choice.levels) : [])] : []),
    make('all-stages', '全段階', choice => levelsInOrder(choice.levels)),
  ]
}

/** Save the visible selection, including explicit empty arrays for unselected modules. */
export function captureSurtrModulePresetSelection(
  choices: readonly SurtrModuleChoice[], excluded: readonly string[], moduleLevels: Readonly<Record<string, readonly number[]>>,
): SurtrModulePresetSelection {
  const stages = getSelectedSurtrModuleStages(choices, excluded, moduleLevels)
  return { includeNone: stages.some(stage => stage.id === 'none'),
    moduleLevels: Object.fromEntries(choices.filter(choice => choice.id).map(choice => [choice.id,
      stages.filter(stage => stage.moduleId === choice.id).map(stage => stage.level),
    ])),
  }
}

/** Presets replace only known MOD selections; unrelated inputs and unknown module state survive. */
export function applySurtrComparisonPreset<T extends { excluded: string[]; moduleLevels: Record<string, number[]> }>(
  state: T, selection: SurtrModulePresetSelection, choices: readonly SurtrModuleChoice[],
): T {
  const knownIds = new Set(choices.map(choice => choice.id))
  const excluded = state.excluded.filter(id => !knownIds.has(id))
  const moduleLevels = Object.fromEntries(Object.entries(state.moduleLevels).map(([id, levels]) => [id, [...levels]]))
  for (const choice of choices) {
    if (!choice.id) {
      if (!selection.includeNone) excluded.push('')
      continue
    }
    moduleLevels[choice.id] = choice.unlocked
      ? levelsInOrder(choice.levels).filter(level => selection.moduleLevels[choice.id]?.includes(level)) : []
  }
  return { ...state, excluded, moduleLevels }
}

/** Missing keys and empty arrays both represent an unselected module. */
export function isSurtrModulePresetSelectionEqual(a: SurtrModulePresetSelection, b: SurtrModulePresetSelection): boolean {
  if (a.includeNone !== b.includeNone) return false
  return [...new Set([...Object.keys(a.moduleLevels), ...Object.keys(b.moduleLevels)])].every(id => {
    const left = levelsInOrder(a.moduleLevels[id] ?? [])
    const right = levelsInOrder(b.moduleLevels[id] ?? [])
    return left.length === right.length && left.every((level, index) => level === right[index])
  })
}

/** Avoid applying saved presets partially when a requested MOD or stage is unavailable. */
export function isSurtrComparisonPresetAvailable(preset: SurtrComparisonPreset, choices: readonly SurtrModuleChoice[]): boolean {
  if (preset.selection.includeNone && !choices.some(choice => !choice.id && choice.unlocked)) return false
  let selected = preset.selection.includeNone
  for (const [id, levels] of Object.entries(preset.selection.moduleLevels)) {
    if (!levels.length) continue
    selected = true
    const choice = choices.find(choice => choice.id === id)
    if (!choice?.unlocked || !levels.every(level => Number.isInteger(level) && choice.levels.includes(level))) return false
  }
  return selected
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizePreset(value: unknown): SurtrComparisonPreset | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string'
    || !value.id.trim() || !value.name.trim() || !isRecord(value.selection)
    || typeof value.selection.includeNone !== 'boolean' || !isRecord(value.selection.moduleLevels)) return null
  const moduleLevels = Object.fromEntries(Object.entries(value.selection.moduleLevels).flatMap(([id, levels]) => {
    if (!id.trim() || !Array.isArray(levels)) return []
    return [[id.trim(), levelsInOrder(levels.filter((level): level is number => typeof level === 'number'))]]
  }))
  if (!value.selection.includeNone && !Object.values(moduleLevels).some(levels => levels.length)) return null
  return { id: value.id.trim(), name: value.name.trim(), selection: { includeNone: value.selection.includeNone, moduleLevels } }
}

function normalizePresets(value: unknown): SurtrComparisonPreset[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap(candidate => {
    const preset = normalizePreset(candidate)
    if (!preset || seen.has(preset.id)) return []
    seen.add(preset.id)
    return [preset]
  })
}

function localStorageOrUndefined(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage } catch { return undefined }
}

export function readSavedSurtrComparisonPresets(storage: Pick<Storage, 'getItem'> | undefined = localStorageOrUndefined()): SurtrComparisonPreset[] {
  try {
    const saved = storage?.getItem(SURTR_COMPARISON_PRESETS_KEY)
    return saved ? normalizePresets(JSON.parse(saved)) : []
  } catch { return [] }
}

export function writeSavedSurtrComparisonPresets(
  presets: readonly SurtrComparisonPreset[], storage: Pick<Storage, 'setItem'> | undefined = localStorageOrUndefined(),
): boolean {
  try {
    if (!storage || !Array.isArray(presets)) return false
    const normalized = normalizePresets(presets)
    if (normalized.length !== presets.length) return false
    storage.setItem(SURTR_COMPARISON_PRESETS_KEY, JSON.stringify(normalized))
    return true
  } catch { return false }
}

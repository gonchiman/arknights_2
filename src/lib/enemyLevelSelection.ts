import { ENEMY_LEVEL_TYPES, type EnemyLevelType } from '../types/enemy.ts'

/** Analysis filters also accept several classes; database filters may keep a scalar. */
export type EnemyLevelSelection = EnemyLevelType | 'ALL' | readonly EnemyLevelType[]

export interface EnemyAnalysisFiltersState {
  levelType: EnemyLevelSelection
}

export const ENEMY_LEVEL_LABELS: Record<EnemyLevelType, string> = {
  NORMAL: '通常',
  ELITE: 'エリート',
  BOSS: 'ボス',
  UNKNOWN: '未分類',
}

/** Empty and complete selections both mean that no class filter is applied. */
export function normalizeEnemyLevelSelection(selection: EnemyLevelSelection): 'ALL' | EnemyLevelType[] {
  if (selection === 'ALL') return 'ALL'
  const values = typeof selection === 'string' ? [selection] : selection
  const ordered = ENEMY_LEVEL_TYPES.filter(value => values.includes(value))
  return ordered.length === 0 || ordered.length === ENEMY_LEVEL_TYPES.length ? 'ALL' : ordered
}

export function toggleEnemyLevelSelection(
  selection: EnemyLevelSelection,
  option: EnemyLevelType | 'ALL',
): EnemyLevelSelection {
  if (option === 'ALL') return 'ALL'
  const normalized = normalizeEnemyLevelSelection(selection)
  if (normalized === 'ALL') return [option]
  return normalizeEnemyLevelSelection(normalized.includes(option)
    ? normalized.filter(value => value !== option)
    : [...normalized, option])
}

/** Keep legacy scalar values and detach arrays before capturing an image or draft. */
export function copyEnemyLevelSelection(selection: EnemyLevelSelection): EnemyLevelSelection {
  return typeof selection === 'string' ? selection : [...selection]
}

export function formatEnemyLevelSelection(
  selection: EnemyLevelSelection,
  labels: Partial<Record<EnemyLevelType | 'ALL', string>> = {},
): string {
  const normalized = normalizeEnemyLevelSelection(selection)
  if (normalized === 'ALL') return labels.ALL ?? '全敵'
  return normalized.map(value => labels[value] ?? ENEMY_LEVEL_LABELS[value]).join('＋')
}

export function isEnemyLevelSelection(value: unknown): value is EnemyLevelSelection {
  const isLevel = (candidate: unknown): candidate is EnemyLevelType => (
    typeof candidate === 'string' && (ENEMY_LEVEL_TYPES as readonly string[]).includes(candidate)
  )
  if (value === 'ALL' || isLevel(value)) return true
  return Array.isArray(value) && value.length > 0 && value.length <= ENEMY_LEVEL_TYPES.length
    && Array.from(value).every(isLevel) && new Set(value).size === value.length
}

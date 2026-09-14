import type { EnemyLevelType, EnemyRecord } from '../types/enemy'

export type EnemyTableSortKey = 'name' | 'level' | 'stages' | 'hp' | 'attack' | 'defense' | 'resistance' | 'speed' | 'interval' | 'weight'

export interface EnemyTableSort {
  key: EnemyTableSortKey
  direction: 'asc' | 'desc'
}

const NAME_COLLATOR = new Intl.Collator('ja', { numeric: true })
const LEVEL_ORDER: Record<EnemyLevelType, number | null> = { NORMAL: 0, ELITE: 1, BOSS: 2, UNKNOWN: null }
const STAT_KEYS = {
  hp: 'maxHp',
  attack: 'attack',
  defense: 'defense',
  resistance: 'magicResistance',
  speed: 'moveSpeed',
  interval: 'baseAttackTime',
  weight: 'massLevel',
} as const

export function sortEnemyRows(rows: readonly EnemyRecord[], sort: EnemyTableSort | null): EnemyRecord[] {
  if (sort === null) return [...rows]

  const direction = sort.direction === 'asc' ? 1 : -1
  return rows.map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const comparison = sort.key === 'name'
        ? NAME_COLLATOR.compare(left.row.name, right.row.name) * direction
        : compareNumericValues(getNumericValue(left.row, sort.key), getNumericValue(right.row, sort.key), direction)
      return comparison || left.index - right.index
    })
    .map(({ row }) => row)
}

function getNumericValue(enemy: EnemyRecord, key: Exclude<EnemyTableSortKey, 'name'>): number | null {
  if (key === 'level') return LEVEL_ORDER[enemy.levelType]
  const value = key === 'stages' ? enemy.stageAppearanceCount : enemy.stats[STAT_KEYS[key]]
  return value !== null && Number.isFinite(value) ? value : null
}

function compareNumericValues(left: number | null, right: number | null, direction: number): number {
  // Missing values stay last even when the requested order is descending.
  if (left === null) return right === null ? 0 : 1
  if (right === null) return -1
  return (left < right ? -1 : left > right ? 1 : 0) * direction
}

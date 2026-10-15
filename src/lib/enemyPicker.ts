import type { EnemyLevelType, EnemyRecord } from '../types/enemy.ts'
import { parseEnemyNumericFilterValue } from './enemyNumericFilters.ts'
import { sortEnemyRows, type EnemyTableSort } from './enemyTableSort.ts'

export type EnemyPickerVariant = 'stats' | 'combat'
export type EnemyPickerDamageType = 'PHYSICAL' | 'ARTS' | 'TRUE' | 'MIXED_UNKNOWN' | 'NO_ATTACK'
export type EnemyPickerSortKey = 'hp' | 'resistance' | 'attack' | 'interval' | 'stages'
export interface EnemyPickerSort { key: EnemyPickerSortKey; direction: 'asc' | 'desc' }
export type EnemyPickerRangeKey = 'hpMin' | 'hpMax' | 'resistanceMin' | 'resistanceMax'
  | 'attackMin' | 'attackMax' | 'intervalMin' | 'intervalMax'
export type EnemyPickerRanges = Record<EnemyPickerRangeKey, string>

export const ENEMY_PICKER_BATCH_SIZE = 20
export const EMPTY_ENEMY_PICKER_RANGES: EnemyPickerRanges = {
  hpMin: '', hpMax: '', resistanceMin: '', resistanceMax: '',
  attackMin: '', attackMax: '', intervalMin: '', intervalMax: '',
}
export const ENEMY_PICKER_DAMAGE_TYPES: ReadonlyArray<{ value: EnemyPickerDamageType | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'すべて' },
  { value: 'PHYSICAL', label: '物理' },
  { value: 'ARTS', label: '術' },
  { value: 'TRUE', label: '確定' },
  { value: 'MIXED_UNKNOWN', label: '混合・不明' },
  { value: 'NO_ATTACK', label: '通常攻撃なし' },
]

export interface EnemyPickerCombatStats {
  attack: number | null
  damageType: EnemyPickerDamageType
  /** The same attack-speed adjustment used by the Surtr duration model. */
  interval: number | null
}

export function getEnemyPickerCombatStats(enemy: EnemyRecord): EnemyPickerCombatStats {
  const types = [...new Set(enemy.damageTypes)]
  let damageType: EnemyPickerDamageType = 'MIXED_UNKNOWN'
  if (types.length === 1) {
    if (types[0] === 'PHYSIC' || types[0] === 'PHYSICAL') damageType = 'PHYSICAL'
    else if (types[0] === 'MAGIC' || types[0] === 'ARTS') damageType = 'ARTS'
    else if (types[0] === 'TRUE') damageType = 'TRUE'
    else if (types[0] === 'NONE' || types[0] === 'NO_ATTACK' || types[0] === 'NO_DAMAGE') damageType = 'NO_ATTACK'
  }
  if (types.length === 0 && (enemy.attackWay === 'NONE' || enemy.attackWay === 'NO_ATTACK')) damageType = 'NO_ATTACK'
  const rawInterval = positive(enemy.stats.baseAttackTime) && positive(enemy.stats.attackSpeed)
    ? enemy.stats.baseAttackTime * 100 / enemy.stats.attackSpeed : null
  return {
    attack: damageType !== 'NO_ATTACK' && nonNegative(enemy.stats.attack) ? enemy.stats.attack : null,
    damageType,
    interval: damageType !== 'NO_ATTACK' && positive(rawInterval) ? rawInterval : null,
  }
}

export function getEnemyPickerDamageTypeLabel(type: EnemyPickerDamageType): string {
  return ENEMY_PICKER_DAMAGE_TYPES.find(option => option.value === type)!.label
}

export function getEnemyPickerRangeError(min: string, max: string, badInput: boolean, label: string): string | null {
  const minimum = parseEnemyNumericFilterValue(min)
  const maximum = parseEnemyNumericFilterValue(max)
  if (badInput || min.trim() !== '' && (minimum === null || minimum < 0) || max.trim() !== '' && (maximum === null || maximum < 0)) {
    return `${label}は0以上の数値で入力してください。`
  }
  return minimum !== null && maximum !== null && minimum > maximum ? `${label}の下限は上限以下にしてください。` : null
}

export function matchesEnemyPickerRange(value: number | null, min: string, max: string): boolean {
  if (getEnemyPickerRangeError(min, max, false, '') !== null) return false
  const minimum = parseEnemyNumericFilterValue(min)
  const maximum = parseEnemyNumericFilterValue(max)
  if (minimum === null && maximum === null) return true
  return value !== null && Number.isFinite(value)
    && (minimum === null || value >= minimum) && (maximum === null || value <= maximum)
}

export interface EnemyPickerFilters {
  variant: EnemyPickerVariant
  levelType: EnemyLevelType | 'ALL'
  ranges: EnemyPickerRanges
  damageType: EnemyPickerDamageType | 'ALL'
  query: string
  searchOpen: boolean
}

export function filterEnemyPickerRows(enemies: readonly EnemyRecord[], filters: EnemyPickerFilters): EnemyRecord[] {
  const query = normalizeSearch(filters.searchOpen ? filters.query : '')
  return enemies.filter(enemy => {
    if (filters.levelType !== 'ALL' && enemy.levelType !== filters.levelType) return false
    if (query && ![enemy.name, enemy.index, enemy.id].some(value => normalizeSearch(value).includes(query))) return false
    const range = filters.ranges
    if (filters.variant === 'stats') return matchesEnemyPickerRange(enemy.stats.maxHp, range.hpMin, range.hpMax)
      && matchesEnemyPickerRange(enemy.stats.magicResistance, range.resistanceMin, range.resistanceMax)
    const stats = getEnemyPickerCombatStats(enemy)
    return (filters.damageType === 'ALL' || filters.damageType === stats.damageType)
      && matchesEnemyPickerRange(stats.attack, range.attackMin, range.attackMax)
      && matchesEnemyPickerRange(stats.interval, range.intervalMin, range.intervalMax)
  })
}

export function sortEnemyPickerRows(enemies: readonly EnemyRecord[], sort: EnemyPickerSort, variant: EnemyPickerVariant): EnemyRecord[] {
  if (variant === 'stats' || sort.key !== 'attack' && sort.key !== 'interval') return sortEnemyRows(enemies, sort as EnemyTableSort)
  const key = sort.key
  const direction = sort.direction === 'asc' ? 1 : -1
  return enemies.map((enemy, index) => ({ enemy, index, value: getEnemyPickerCombatStats(enemy)[key] }))
    .sort((left, right) => {
      if (left.value === null) return right.value === null ? left.index - right.index : 1
      if (right.value === null) return -1
      return (left.value - right.value) * direction || left.index - right.index
    }).map(entry => entry.enemy)
}

function normalizeSearch(value: string): string { return value.normalize('NFKC').trim().toLocaleLowerCase('ja') }
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0 }
function nonNegative(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 }

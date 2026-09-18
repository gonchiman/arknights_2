import type { EnemyRecord } from '../types/enemy.ts'

export const ENEMY_NUMERIC_FILTER_FIELDS = [
  { key: 'maxHp', label: 'HP', unit: '' },
  { key: 'attack', label: '攻撃力', unit: '' },
  { key: 'defense', label: '防御力', unit: '' },
  { key: 'magicResistance', label: '術耐性', unit: '' },
  { key: 'moveSpeed', label: '移動速度', unit: '' },
  { key: 'baseAttackTime', label: '攻撃間隔', unit: '秒' },
  { key: 'massLevel', label: '重量', unit: '' },
  { key: 'stageAppearanceCount', label: '登場ステージ数', unit: '' },
] as const

export const ENEMY_NUMERIC_FILTER_OPERATORS = [
  { key: 'eq', label: '等しい' },
  { key: 'gte', label: '以上' },
  { key: 'lte', label: '以下' },
  { key: 'gt', label: 'より大きい' },
  { key: 'lt', label: 'より小さい' },
] as const

export type EnemyNumericFilterField = typeof ENEMY_NUMERIC_FILTER_FIELDS[number]['key']
export type EnemyNumericFilterOperator = typeof ENEMY_NUMERIC_FILTER_OPERATORS[number]['key']

export interface EnemyNumericCondition {
  id: number
  field: EnemyNumericFilterField
  operator: EnemyNumericFilterOperator
  value: string
}

const OPERATOR_SYMBOLS: Record<EnemyNumericFilterOperator, string> = {
  eq: '＝',
  gte: '≥',
  lte: '≤',
  gt: '＞',
  lt: '＜',
}

export function parseEnemyNumericFilterValue(value: string): number | null {
  const normalized = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

export function formatEnemyNumericCondition(condition: EnemyNumericCondition): string | null {
  const value = parseEnemyNumericFilterValue(condition.value)
  if (value === null) return null
  const field = ENEMY_NUMERIC_FILTER_FIELDS.find(({ key }) => key === condition.field)
  return field ? `${field.label}${OPERATOR_SYMBOLS[condition.operator]}${value}${field.unit}` : null
}

export function matchesEnemyNumericConditions(
  enemy: EnemyRecord,
  conditions: readonly EnemyNumericCondition[],
): boolean {
  return conditions.every((condition) => {
    const threshold = parseEnemyNumericFilterValue(condition.value)
    if (threshold === null) return true
    const value = condition.field === 'stageAppearanceCount'
      ? enemy.stageAppearanceCount
      : enemy.stats[condition.field]
    if (value === null || !Number.isFinite(value)) return false

    switch (condition.operator) {
      case 'eq': return value === threshold
      case 'gte': return value >= threshold
      case 'lte': return value <= threshold
      case 'gt': return value > threshold
      case 'lt': return value < threshold
      default: return false
    }
  })
}

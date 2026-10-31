import type { EnemyRecord } from '../types/enemy.ts'
import { getEnemyCountWeight, type EnemyHistogramCountMode, type EnemyHistogramCounts } from './enemyHistogramCounts.ts'

export const ENEMY_IMMUNITIES = [
  { key: 'stunImmune', label: 'スタン' },
  { key: 'silenceImmune', label: '沈黙' },
  { key: 'sleepImmune', label: '睡眠' },
  { key: 'frozenImmune', label: '凍結' },
  { key: 'levitateImmune', label: '浮遊' },
  { key: 'disarmedCombatImmune', label: '戦慄' },
  { key: 'fearedImmune', label: '恐怖' },
  { key: 'palsyImmune', label: '麻痺' },
  { key: 'attractImmune', label: '誘導' },
] as const

export type EnemyImmunityKey = typeof ENEMY_IMMUNITIES[number]['key']
export type EnemyImmunityCountMode = Extract<EnemyHistogramCountMode, 'TYPES' | 'SPAWNS'>

export interface EnemyImmunitySummaryItem {
  key: EnemyImmunityKey
  label: string
  count: number
  ratio: number
}

export interface EnemyImmunitySummary {
  total: number
  items: EnemyImmunitySummaryItem[]
}

export function summarizeEnemyImmunities(
  rows: readonly EnemyRecord[],
  mode: EnemyImmunityCountMode = 'TYPES',
  counts: EnemyHistogramCounts | null = null,
): EnemyImmunitySummary {
  const weightedRows = uniqueEnemies(rows).map((row) => ({
    row,
    weight: getEnemyCountWeight(row.id, mode, counts),
  }))
  const total = weightedRows.reduce((sum, { weight }) => sum + weight, 0)
  const items = ENEMY_IMMUNITIES.map(({ key, label }): EnemyImmunitySummaryItem => {
    const count = weightedRows.reduce((sum, { row, weight }) => sum + (hasImmunity(row, key) ? weight : 0), 0)
    return { key, label, count, ratio: total === 0 ? 0 : count / total }
  })
  // Stable sorting keeps the definition order when counts are equal.
  items.sort((a, b) => b.count - a.count)
  return { total, items }
}

export function filterEnemiesByImmunity(rows: readonly EnemyRecord[], key: EnemyImmunityKey): EnemyRecord[] {
  return uniqueEnemies(rows).filter((row) => hasImmunity(row, key))
}

function hasImmunity(row: EnemyRecord, key: EnemyImmunityKey): boolean {
  const definition = ENEMY_IMMUNITIES.find((item) => item.key === key)
  if (!definition) return false
  return row.statusImmunities.includes(definition.label)
    || (key === 'disarmedCombatImmune' && row.statusImmunities.includes('武装解除'))
}

function uniqueEnemies(rows: readonly EnemyRecord[]): EnemyRecord[] {
  const byId = new Map<string, EnemyRecord>()
  // Inputs are base-level records; do not merge later duplicate records into them.
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row)
  }
  return [...byId.values()]
}

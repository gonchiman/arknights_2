import { ENEMY_LEVEL_TYPES, type EnemyLevelType, type EnemyRecord } from '../types/enemy.ts'
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
export type EnemyImmunityOverlapDenominator = 'ROW' | 'ALL'

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

export interface EnemyImmunityLevelSummaryItem {
  levelType: EnemyLevelType
  total: number
  count: number
  ratio: number
}

export interface EnemyImmunityLevelSummary {
  total: number
  count: number
  ratio: number
  groups: EnemyImmunityLevelSummaryItem[]
}

export interface EnemyImmunityOverlapCell {
  key: EnemyImmunityKey
  label: string
  count: number
  ratio: number | null
}

export interface EnemyImmunityOverlapRow {
  key: EnemyImmunityKey
  label: string
  total: number
  cells: EnemyImmunityOverlapCell[]
}

export interface EnemyImmunityOverlapSummary {
  total: number
  rows: EnemyImmunityOverlapRow[]
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

export function summarizeEnemyImmunityByLevel(
  rows: readonly EnemyRecord[],
  key: EnemyImmunityKey,
  mode: EnemyImmunityCountMode = 'TYPES',
  counts: EnemyHistogramCounts | null = null,
): EnemyImmunityLevelSummary {
  const groups: EnemyImmunityLevelSummaryItem[] = ENEMY_LEVEL_TYPES.map(levelType => ({
    levelType, total: 0, count: 0, ratio: 0,
  }))
  const byLevel = new Map(groups.map(group => [group.levelType, group]))
  // Deduplicate before partitioning so later records cannot enter another class.
  for (const row of uniqueEnemies(rows)) {
    const group = byLevel.get(row.levelType)!
    const weight = getEnemyCountWeight(row.id, mode, counts)
    group.total += weight
    if (hasImmunity(row, key)) group.count += weight
  }
  for (const group of groups) group.ratio = group.total === 0 ? 0 : group.count / group.total
  const total = groups.reduce((sum, group) => sum + group.total, 0)
  const count = groups.reduce((sum, group) => sum + group.count, 0)
  return { total, count, ratio: total === 0 ? 0 : count / total, groups }
}

export function filterEnemiesByImmunity(rows: readonly EnemyRecord[], key: EnemyImmunityKey): EnemyRecord[] {
  return uniqueEnemies(rows).filter((row) => hasImmunity(row, key))
}

export function summarizeEnemyImmunityOverlaps(
  rows: readonly EnemyRecord[],
  mode: EnemyImmunityCountMode = 'TYPES',
  counts: EnemyHistogramCounts | null = null,
  denominator: EnemyImmunityOverlapDenominator = 'ROW',
): EnemyImmunityOverlapSummary {
  const overlaps: EnemyImmunityOverlapRow[] = ENEMY_IMMUNITIES.map(({ key, label }) => ({
    key, label, total: 0,
    cells: ENEMY_IMMUNITIES.map(definition => ({ ...definition, count: 0, ratio: null })),
  }))
  let total = 0
  for (const enemy of uniqueEnemies(rows)) {
    const weight = getEnemyCountWeight(enemy.id, mode, counts)
    total += weight
    const present = ENEMY_IMMUNITIES.flatMap(({ key }, index) => hasImmunity(enemy, key) ? [index] : [])
    for (const rowIndex of present) {
      const row = overlaps[rowIndex]
      row.total += weight
      for (const columnIndex of present) row.cells[columnIndex].count += weight
    }
  }
  for (const row of overlaps) {
    const base = denominator === 'ALL' ? total : row.total
    for (const cell of row.cells) cell.ratio = base === 0 ? null : cell.count / base
  }
  return { total, rows: overlaps }
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

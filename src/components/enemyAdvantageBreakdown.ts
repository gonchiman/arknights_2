import type { EnemyAdvantageCategoryRow, EnemySpawnAdvantageRow, EnemySpawnAdvantageStatistics } from '../lib/damageThreeEnemySpawnAdvantage'
import type { AdvantageUnit } from '../lib/damageThreeSkillRankStatistics'

export const ENEMY_ADVANTAGE_BREAKDOWNS = [
  ['all', '全体'], ['defense', '防御力帯別'], ['profession', '職業別'], ['rarity', 'レアリティ別'],
] as const
export type EnemyAdvantageBreakdown = typeof ENEMY_ADVANTAGE_BREAKDOWNS[number][0]

export type EnemyAdvantageDisplayRow = EnemySpawnAdvantageRow | Omit<EnemyAdvantageCategoryRow, 'key'>

export function getEnemyAdvantageDisplayRows(
  statistics: Omit<EnemySpawnAdvantageStatistics, 'operators'>, breakdown: EnemyAdvantageBreakdown,
  profession = 'ALL', rarity = 'ALL',
): readonly EnemyAdvantageDisplayRow[] {
  if (breakdown === 'all') return statistics.rows.slice(0, 1)
  if (breakdown === 'defense') return statistics.rows
  const [total] = statistics.rows
  if (!total) return []
  const categories = breakdown === 'profession' ? statistics.professionRows : statistics.rarityRows
  const filter = breakdown === 'profession' ? profession : rarity
  return [
    { label: total.label, skill: total.skill, stage: total.stage, skillCount: statistics.skillCount, stageCount: statistics.stageCount },
    ...categories.filter(row => filter === 'ALL' || row.key === filter),
  ]
}

export function getVisibleEnemyAdvantageRows(rows: readonly EnemyAdvantageDisplayRow[], hiddenLabels: readonly string[]) {
  return rows.filter(row => !hiddenLabels.includes(row.label))
}

export function getEnemyAdvantageCountLabel(breakdown: EnemyAdvantageBreakdown, unit: AdvantageUnit) {
  if (breakdown === 'profession' || breakdown === 'rarity') return unit === 'skill' ? '有効スキル数' : '有効段階数'
  return '出現回数'
}

export function getEnemyAdvantageRowCount(row: EnemyAdvantageDisplayRow, unit: AdvantageUnit) {
  if ('skillCount' in row) return unit === 'skill' ? row.skillCount : row.stageCount
  return row.spawnCount
}

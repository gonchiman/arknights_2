import type { EnemyAdvantageCategoryRow, EnemyOutlierRow, EnemyOutlierScope, EnemySpawnAdvantageRow, EnemySpawnAdvantageStatistics } from '../lib/damageThreeEnemySpawnAdvantage'
import type { AdvantageUnit } from '../lib/damageThreeSkillRankStatistics'

export const ENEMY_ADVANTAGE_BREAKDOWNS = [
  ['all', '全体'], ['defense', '防御力帯別'], ['profession', '職業別'], ['rarity', 'レアリティ別'],
  ['outlier', '防御力・術耐性の外れ値別'],
] as const
export type EnemyAdvantageBreakdown = typeof ENEMY_ADVANTAGE_BREAKDOWNS[number][0]

export const ENEMY_OUTLIER_SCOPES = [['all', '全敵'], ['eliteBoss', 'エリート＋ボス']] as const

export function formatEnemyOutlierFences({ defenseFence, resistanceFence }: EnemySpawnAdvantageStatistics['outliers'], valuesOnly = false) {
  const values = defenseFence === null || resistanceFence === null ? '算出不可'
    : `防御力 ${defenseFence.toLocaleString('ja-JP')}超・術耐性 ${resistanceFence.toLocaleString('ja-JP')}超`
  return valuesOnly ? values : `上側外れ値の基準（全敵） ${values}`
}

export type EnemyAdvantageDisplayRow = EnemySpawnAdvantageRow | EnemyOutlierRow | Omit<EnemyAdvantageCategoryRow, 'key'>

export function getEnemyAdvantageDisplayRows(
  statistics: Omit<EnemySpawnAdvantageStatistics, 'operators'>, breakdown: EnemyAdvantageBreakdown,
  profession = 'ALL', rarity = 'ALL', outlierScope: EnemyOutlierScope = 'all',
): readonly EnemyAdvantageDisplayRow[] {
  if (breakdown === 'all') return statistics.rows.slice(0, 1)
  if (breakdown === 'defense') return statistics.rows
  if (breakdown === 'outlier') return statistics.outliers[outlierScope]
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

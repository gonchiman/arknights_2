import type { AdvantageUnit, SkillRankStatistics } from './damageThreeSkillRankStatistics'

export const ADVANTAGE_LEGEND = 'ダメージが高い属性'
export const ADVANTAGE_OUTCOMES = [
  { series: 'physical', key: 'physicalWins', label: '物理', description: '物理の方がダメージが高い' },
  { series: 'tie', key: 'ties', label: '同じ', description: '同じダメージ' },
  { series: 'arts', key: 'artsWins', label: '術', description: '術の方がダメージが高い' },
] as const

export function getAdvantageChartAxisTitle(unit: AdvantageUnit) {
  return unit === 'skill' ? '得票率（1スキル1票）' : '有効段階数に占める割合'
}

export function getAdvantageChartBar(row: SkillRankStatistics, unit: AdvantageUnit) {
  const votes = unit === 'skill' ? row.bySkill : row
  if (row.defense === null || !votes.count) return null

  let precedingVotes = 0
  const segments = ADVANTAGE_OUTCOMES.map(({ key, series, description }) => {
    const count = votes[key]
    const start = precedingVotes / votes.count
    precedingVotes += count
    return { series, description, count, start, fraction: count / votes.count }
  })
  return { defense: row.defense, count: votes.count, segments }
}

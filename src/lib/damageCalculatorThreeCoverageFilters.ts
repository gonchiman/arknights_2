import type {
  DamageCalculatorThreeCoverageRow,
  DamageCalculatorThreeCoverageStatus,
} from './damageCalculatorThreeCoverage.ts'

export interface DamageCalculatorThreeCoverageFilters {
  query: string
  profession: string
  rarity: number | 'ALL'
  status: DamageCalculatorThreeCoverageStatus | 'ALL'
}

export const DEFAULT_DAMAGE_THREE_COVERAGE_FILTERS: DamageCalculatorThreeCoverageFilters = {
  query: '', profession: 'WARRIOR', rarity: 6, status: 'ALL',
}

export const EMPTY_DAMAGE_THREE_COVERAGE_FILTERS: DamageCalculatorThreeCoverageFilters = {
  query: '', profession: 'ALL', rarity: 'ALL', status: 'ALL',
}

export function filterDamageCalculatorThreeCoverage(
  rows: readonly DamageCalculatorThreeCoverageRow[],
  filters: DamageCalculatorThreeCoverageFilters,
): DamageCalculatorThreeCoverageRow[] {
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean)
  return rows.filter(({ skill, status }) => {
    if (filters.profession !== 'ALL' && skill.profession !== filters.profession) return false
    if (filters.rarity !== 'ALL' && skill.rarity !== filters.rarity) return false
    if (filters.status !== 'ALL' && status !== filters.status) return false
    const name = normalize(`${skill.operatorName} ${skill.skillName}`)
    return terms.every((term) => /^s\d+$/.test(term)
      ? term === `s${skill.skillIndex}` : name.includes(term))
  })
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ja-JP').trim()
}

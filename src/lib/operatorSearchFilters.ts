import type { OperatorInitial, SkillRecord } from '../types/skill.ts'

export interface FilterState {
  query: string
  nameInitial: OperatorInitial | 'ALL'
  profession: string | 'ALL'
  subProfession: string | 'ALL'
  rarity: number | 'ALL'
}

export interface SubProfessionOption {
  value: string
  label: string
}

export const EMPTY_OPERATOR_FILTERS: FilterState = {
  query: '',
  nameInitial: 'ALL',
  profession: 'ALL',
  subProfession: 'ALL',
  rarity: 'ALL',
}

export function matchesOperatorFilters(row: SkillRecord, filters: FilterState): boolean {
  const query = normalizeSearchText(filters.query)
  if (
    query
    && !normalizeSearchText(`${row.operatorName} ${row.skillName} ${row.description} ${row.skillId}`).includes(query)
  ) return false
  if (filters.nameInitial !== 'ALL' && row.nameInitial !== filters.nameInitial) return false
  if (filters.profession !== 'ALL' && row.profession !== filters.profession) return false
  if (filters.subProfession !== 'ALL' && row.subProfessionId !== filters.subProfession) return false
  if (filters.rarity !== 'ALL' && row.rarity !== filters.rarity) return false
  return true
}

export function buildSubProfessionOptions(
  rows: SkillRecord[],
  profession: string | 'ALL',
): SubProfessionOption[] {
  const matchingRows = profession === 'ALL'
    ? rows
    : rows.filter((row) => row.profession === profession)

  return [...new Map(matchingRows.map((row) => [row.subProfessionId, {
    value: row.subProfessionId,
    label: row.subProfessionName,
  }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'))
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja')
}

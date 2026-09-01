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

export const RECENT_OPERATOR_LIMIT = 6

export const EMPTY_OPERATOR_FILTERS: FilterState = {
  query: '',
  nameInitial: 'ALL',
  profession: 'ALL',
  subProfession: 'ALL',
  rarity: 'ALL',
}

export function hasActiveOperatorFilters(filters: FilterState): boolean {
  return filters.query.trim() !== ''
    || filters.nameInitial !== 'ALL'
    || filters.profession !== 'ALL'
    || filters.subProfession !== 'ALL'
    || filters.rarity !== 'ALL'
}

export function addRecentOperatorId(
  recentOperatorIds: readonly string[],
  operatorId: string,
  limit = RECENT_OPERATOR_LIMIT,
): string[] {
  return normalizeRecentOperatorIds([operatorId, ...recentOperatorIds], limit)
}

export function normalizeRecentOperatorIds(
  recentOperatorIds: readonly string[],
  limit = RECENT_OPERATOR_LIMIT,
): string[] {
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : RECENT_OPERATOR_LIMIT
  if (normalizedLimit === 0) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const operatorId of recentOperatorIds) {
    const id = operatorId.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    normalized.push(id)
    if (normalized.length >= normalizedLimit) break
  }
  return normalized
}

export function getRecentOperatorRows(
  rows: SkillRecord[],
  recentOperatorIds: readonly string[],
): SkillRecord[] {
  const firstRowByOperator = new Map<string, SkillRecord>()
  rows.forEach((row) => {
    if (!firstRowByOperator.has(row.operatorId)) firstRowByOperator.set(row.operatorId, row)
  })
  return recentOperatorIds
    .map((operatorId) => firstRowByOperator.get(operatorId))
    .filter((row): row is SkillRecord => row !== undefined)
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

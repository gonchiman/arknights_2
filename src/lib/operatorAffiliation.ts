import type { OperatorAffiliationIds } from '../types/skill.ts'

export type { OperatorAffiliationIds } from '../types/skill.ts'

export type OperatorAffiliationTable = Record<string, { powerName?: string | null }>

export function getOperatorAffiliationIds(operator: OperatorAffiliationIds): OperatorAffiliationIds {
  const result: OperatorAffiliationIds = {}
  for (const key of ['nationId', 'groupId', 'teamId'] as const) {
    const value = operator[key]
    if (value === null) result[key] = null
    else if (typeof value === 'string') result[key] = value.trim() || null
    // Keep missing or malformed source data unknown, rather than asserting no affiliation.
  }
  return result
}

export function getOperatorAffiliation(
  operator: OperatorAffiliationIds,
  names: OperatorAffiliationTable,
): string | null {
  // Prefer the most specific primary affiliation; a country is not necessarily a birthplace.
  const id = [operator.teamId, operator.groupId, operator.nationId]
    .find((value) => typeof value === 'string' && value.trim())?.trim()
  if (!id) return null
  const name = names?.[id]?.powerName
  return typeof name === 'string' && name.trim() ? name.trim() : id
}

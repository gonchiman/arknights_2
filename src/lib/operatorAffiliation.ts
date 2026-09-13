export interface OperatorAffiliationIds {
  nationId?: string | null
  groupId?: string | null
  teamId?: string | null
}

export type OperatorAffiliationTable = Record<string, { powerName?: string | null }>

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

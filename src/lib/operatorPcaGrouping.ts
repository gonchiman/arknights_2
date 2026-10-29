import type { OperatorDatabaseRecord } from './operatorDatabase.ts'
import { getProfessionColor, getProfessionLabel, PROFESSION_ORDER } from './operatorFilters.ts'

export type OperatorPcaColorBy = 'profession' | 'rarity' | 'subProfession'

export const OPERATOR_PCA_COLOR_BY_OPTIONS = [
  { value: 'profession', label: '職業' },
  { value: 'rarity', label: 'レアリティ' },
  { value: 'subProfession', label: '職分' },
] as const satisfies readonly { value: OperatorPcaColorBy; label: string }[]

export interface OperatorPcaGroup {
  id: string
  label: string
  color: string
  shape: 'circle' | 'square'
}

// PCA-only rarity appearances; other pages do not yet define a rarity palette.
const RARITY_COLORS: Readonly<Record<number, string>> = {
  1: '#858b92',
  2: '#79945e',
  3: '#628eac',
  4: '#997bb3',
  5: '#b39b4b',
  6: '#bf8054',
}
const compareJapanese = new Intl.Collator('ja').compare
const professionRank = (profession: string) => {
  const index = (PROFESSION_ORDER as readonly string[]).indexOf(profession)
  return index < 0 ? PROFESSION_ORDER.length : index
}
const validRarity = (rarity: number) => Number.isSafeInteger(rarity) && rarity > 0

export function getOperatorPcaGroupId(operator: OperatorDatabaseRecord, colorBy: OperatorPcaColorBy): string {
  switch (colorBy) {
    case 'rarity': return `rarity:${validRarity(operator.rarity) ? operator.rarity : 'unknown'}`
    case 'subProfession': return `subProfession:${JSON.stringify([operator.profession, operator.subProfessionId])}`
    default: return `profession:${operator.profession}`
  }
}

function branchAppearance(id: string): Pick<OperatorPcaGroup, 'color' | 'shape'> {
  // An ID-based appearance stays stable when data order, filters, or the catalog change.
  let hash = 2166136261
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  const hue = (hash % 36000) / 100
  const saturation = 42 + ((hash >>> 8) % 3) * 7
  const lightness = 44 + ((hash >>> 16) % 3) * 7
  return { color: `hsl(${hue} ${saturation}% ${lightness}%)`, shape: hash % 2 === 0 ? 'circle' : 'square' }
}

function groupFor(operator: OperatorDatabaseRecord, colorBy: OperatorPcaColorBy): OperatorPcaGroup {
  const id = getOperatorPcaGroupId(operator, colorBy)
  if (colorBy === 'rarity') return {
    id,
    label: validRarity(operator.rarity) ? `★${operator.rarity}` : '不明',
    color: RARITY_COLORS[operator.rarity] ?? 'var(--text-muted)',
    shape: 'circle',
  }
  if (colorBy === 'subProfession') return {
    id,
    label: operator.subProfessionName.trim() || operator.subProfessionId
      || (operator.profession ? `${getProfessionLabel(operator.profession)}・不明` : '不明'),
    ...branchAppearance(id),
  }
  return {
    id,
    label: getProfessionLabel(operator.profession),
    color: getProfessionColor(operator.profession)?.main ?? 'var(--text-muted)',
    shape: operator.profession === 'SUPPORT' || operator.profession === 'SPECIAL' ? 'square' : 'circle',
  }
}

/** Build from the analysis population; the view may subsequently hide absent groups. */
export function buildOperatorPcaGroups(
  operators: readonly OperatorDatabaseRecord[],
  colorBy: OperatorPcaColorBy,
): OperatorPcaGroup[] {
  const representatives = new Map<string, OperatorDatabaseRecord>()
  for (const operator of operators) {
    const id = getOperatorPcaGroupId(operator, colorBy)
    const previous = representatives.get(id)
    if (!previous || operator.operatorId < previous.operatorId) representatives.set(id, operator)
  }
  return [...representatives.values()]
    .sort((a, b) => {
      if (colorBy === 'rarity') return (validRarity(a.rarity) ? a.rarity : Infinity)
        - (validRarity(b.rarity) ? b.rarity : Infinity)
      return professionRank(a.profession) - professionRank(b.profession)
        || compareJapanese(getProfessionLabel(a.profession), getProfessionLabel(b.profession))
        || (colorBy === 'subProfession' ? compareJapanese(a.subProfessionName, b.subProfessionName)
          || a.subProfessionId.localeCompare(b.subProfessionId) : 0)
    })
    .map(operator => groupFor(operator, colorBy))
}

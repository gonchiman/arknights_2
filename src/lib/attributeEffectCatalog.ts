import type { SkillRecord } from '../types/skill.ts'
import { buildAttributeEffectTalents } from './attributeEffectTalents.ts'
import { buildAttributeEffectSkills } from './attributeEffectSkills.ts'

export type AttributeEffectRow = {
  id: string
  operatorName: string
  source: 'talent' | 'skill'
  sourceLabel: string
  name: string
  attribute: 'physical' | 'arts'
  effect: string
  amount: string
  condition: string
  href: string
}

export type AttributeEffectCatalogFilters = {
  attribute: 'all' | AttributeEffectRow['attribute']
  source: 'all' | AttributeEffectRow['source']
  query: string
}

const japaneseOrder = new Intl.Collator('ja', { numeric: true })

export function buildAttributeEffectCatalog(rows: readonly SkillRecord[]): AttributeEffectRow[] {
  return [...buildAttributeEffectTalents(rows), ...buildAttributeEffectSkills(rows)].sort((a, b) =>
    japaneseOrder.compare(a.operatorName, b.operatorName)
    || (a.source === b.source ? 0 : a.source === 'talent' ? -1 : 1)
    || japaneseOrder.compare(a.sourceLabel, b.sourceLabel)
    || japaneseOrder.compare(a.id, b.id))
}

function searchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ja')
}

export function filterAttributeEffectCatalog(rows: readonly AttributeEffectRow[], filters: AttributeEffectCatalogFilters): AttributeEffectRow[] {
  const words = searchText(filters.query).trim().split(/\s+/u).filter(Boolean)
  return rows.filter(row => {
    if (filters.attribute !== 'all' && row.attribute !== filters.attribute) return false
    if (filters.source !== 'all' && row.source !== filters.source) return false
    const searchable = searchText([row.operatorName, row.name, row.sourceLabel].join(' '))
    return words.every(word => searchable.includes(word))
  })
}

import type { OperatorTalentRecord, SkillRecord } from '../types/skill.ts'
import { buildAttributeEffectTalents } from './attributeEffectTalents.ts'
import { buildAttributeEffectSkills } from './attributeEffectSkills.ts'
import { buildAttributeEffectSummons } from './attributeEffectSummons.ts'

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
} & ({ href: string; description?: never } | { href: null; description: string })

export type AttributeEffectCatalogFilters = {
  attribute: 'all' | AttributeEffectRow['attribute']
  source: 'all' | AttributeEffectRow['source']
  query: string
}

const japaneseOrder = new Intl.Collator('ja', { numeric: true })
const effectDisplayOrder = new Map([
  '防御力無視', '術耐性無視', '防御力低下', '術耐性低下',
  '与ダメージ増加', '被ダメージ増加', '被ダメージ加算（軽減前）',
].map((effect, index) => [effect, index]))

export type AttributeEffectSummary = { effect: string; physical: number; arts: number }

export function summarizeAttributeEffects(rows: readonly AttributeEffectRow[]): AttributeEffectSummary[] {
  const groups = new Map<string, AttributeEffectSummary>()
  for (const { effect, attribute } of rows) {
    let group = groups.get(effect)
    if (!group) {
      group = { effect, physical: 0, arts: 0 }
      groups.set(effect, group)
    }
    group[attribute] += 1
  }
  return [...groups.values()].sort((a, b) => {
    const aOrder = effectDisplayOrder.get(a.effect) ?? effectDisplayOrder.size
    const bOrder = effectDisplayOrder.get(b.effect) ?? effectDisplayOrder.size
    return aOrder - bOrder || japaneseOrder.compare(a.effect, b.effect)
  })
}

export function buildAttributeEffectCatalog(rows: readonly SkillRecord[], operators?: readonly OperatorTalentRecord[]): AttributeEffectRow[] {
  return [...buildAttributeEffectTalents(rows, operators), ...buildAttributeEffectSkills(rows), ...buildAttributeEffectSummons(rows)].sort((a, b) =>
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

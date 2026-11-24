import type { DamageThreeComparisonEntry } from './damageCalculatorThreeComparison.ts'
import { PROFESSION_ORDER } from './operatorFilters.ts'

export interface DamageThreeSkillFilterValues {
  kind: DamageThreeComparisonEntry['kind'] | 'ALL'
  query: string
  profession: string
  rarity: string
  damageType: string
}

export const DAMAGE_TYPE_LABELS: Record<string, string> = {
  PHYSICAL: '物理', ARTS: '術', TRUE: '確定', ELEMENTAL: '元素', MIXED: '混合',
}

export function getDamageThreeProfessionOptions(entries: readonly DamageThreeComparisonEntry[]) {
  const labels = new Map(entries.map(({ skill }) => [skill.profession, skill.professionLabel]))
  return PROFESSION_ORDER.filter(value => labels.has(value)).map(value => ({ value, label: labels.get(value)! }))
}

// Damage type depends on the evaluated attack, so callers apply it to their results.
export function filterDamageThreeSkillEntries<T extends DamageThreeComparisonEntry>(
  entries: readonly T[], { kind, query, profession, rarity }: Omit<DamageThreeSkillFilterValues, 'damageType'>,
): T[] {
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase()
  const words = normalize(query).trim().split(/\s+/).filter(Boolean)
  return entries.filter(entry => {
    if (kind !== 'ALL' && entry.kind !== kind) return false
    if (profession !== 'ALL' && entry.skill.profession !== profession) return false
    if (rarity !== 'ALL' && entry.skill.rarity !== Number(rarity)) return false
    if (!words.length) return true
    const { operatorName, skillName, skillIndex } = entry.skill
    const text = normalize(`${operatorName} ${skillName} S${skillIndex} ${entry.stageLabel}`)
    return words.every(word => text.includes(word))
  })
}

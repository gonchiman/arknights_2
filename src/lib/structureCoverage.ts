import type { SkillRecord } from '../types/skill.ts'
import { PROFESSION_ORDER } from './operatorFilters.ts'
import { createSkillJsonSelectionKey } from './skillJsonAnalysis.ts'
import { createSkillStructureHash, createTalentStructureHash, createTraitStructureHash } from './routes.ts'
import { getSkillCoarseCategories, SKILL_COARSE_CATEGORY_LABELS } from './skillCoarseClassification.ts'
import { buildTalentCoarseRecords, getTalentCoarseCategories, TALENT_COARSE_CATEGORY_LABELS } from './talentCoarseClassification.ts'
import { buildTraitCoarseRecords, getTraitCoarseCategories, TRAIT_COARSE_CATEGORY_LABELS } from './traitCoarseClassification.ts'
import { SKILL_STRUCTURES, type SkillStructure } from './skillStructure.ts'
import { getSkillStructureDeferredCases } from './skillStructureDeferredCases.ts'
import { buildTalentStructures, describeRegisteredTalentEffects } from './talentStructure.ts'
import { buildTraitStructures, isTraitStructureOperator, formatTraitStructureEffectItem } from './traitStructure.ts'

export type StructureCoverageKind = 'skill' | 'talent' | 'trait'
export interface StructureCoverageConcern { title: string; detail: string }
export interface StructureCoverageRecord {
  id: string
  kind: StructureCoverageKind
  operatorId: string
  operatorName: string
  profession: string
  professionLabel: string
  rarity: number
  number: number | null
  name: string
  jobName: string
  description: string
  categoryLabels: string[]
  /** A definition exists; this does not assert that all effects are resolved or executable. */
  registered: boolean
  structureHref?: string
  concerns: StructureCoverageConcern[]
}
export type StructureCoverage = Record<StructureCoverageKind, StructureCoverageRecord[]>
export interface StructureCoverageSummary {
  total: number
  registered: number
  unregistered: number
  /** Percentage, or null when the denominator is zero. */
  rate: number | null
}
export interface StructureCoverageFilters {
  query: string
  profession: string
  rarity: number | 'ALL'
  registration: 'ALL' | 'REGISTERED' | 'UNREGISTERED'
}
export const DEFAULT_STRUCTURE_COVERAGE_FILTERS: StructureCoverageFilters = {
  query: '', profession: 'ALL', rarity: 'ALL', registration: 'ALL',
}

/** Each corpus has its own unit: skill identity, talent slot, and operator trait. */
export function buildStructureCoverage(rows: readonly SkillRecord[]): StructureCoverage {
  const skills = [...new Map(rows.map(row => [createSkillJsonSelectionKey(row), row])).values()]
  const skillDefinitions = new Map<string, SkillStructure[]>()
  for (const structure of SKILL_STRUCTURES) {
    const key = createSkillJsonSelectionKey(structure.basicInfo)
    const definitions = skillDefinitions.get(key) ?? []
    definitions.push(structure)
    skillDefinitions.set(key, definitions)
  }
  const skill: StructureCoverageRecord[] = skills.map(row => {
    const definitions = skillDefinitions.get(createSkillJsonSelectionKey(row)) ?? []
    const latest = definitions.reduce<SkillStructure | undefined>((selected, value) => (
      !selected || value.basicInfo.levelIndex > selected.basicInfo.levelIndex ? value : selected
    ), undefined)
    return {
      ...operatorFields(row), id: `skill:${createSkillJsonSelectionKey(row)}`, kind: 'skill',
      number: row.skillIndex, name: row.skillName, description: row.description,
      categoryLabels: getSkillCoarseCategories(row).map(value => SKILL_COARSE_CATEGORY_LABELS[value]),
      registered: definitions.length > 0,
      structureHref: latest ? createSkillStructureHash(latest.basicInfo) : undefined,
      concerns: uniqueConcerns(definitions.flatMap(skillConcerns)),
    }
  })

  const talentDefinitions = new Set(describeRegisteredTalentEffects(skills).map(talentKey))
  const talentStructures = new Map(buildTalentStructures(skills).map(value => [talentKey(value.basicInfo), value]))
  const talent: StructureCoverageRecord[] = buildTalentCoarseRecords(skills).map(row => {
    const registered = talentDefinitions.has(talentKey(row))
    const structure = talentStructures.get(talentKey(row))
    const concerns = structure ? [
      ...structure.deferred.map(value => ({ title: value.title, detail: value.unresolved })),
      ...structure.issues.map(detail => ({ title: 'データの確認', detail })),
    ] : registered ? [{ title: 'データの確認', detail: '登録された素質の定義と現在のデータの対応を確認できません。' }] : []
    return {
      ...operatorFields(row), id: row.id, kind: 'talent', number: row.talentIndex + 1,
      name: row.talentName, description: row.description,
      categoryLabels: getTalentCoarseCategories(row).map(value => TALENT_COARSE_CATEGORY_LABELS[value]),
      registered, structureHref: registered ? createTalentStructureHash(row) : undefined,
      concerns: uniqueConcerns(concerns),
    }
  })

  const operators = new Map(skills.map(row => [row.operatorId, row]))
  const traitStructures = new Map(buildTraitStructures(skills).map(value => [value.basicInfo.operatorId, value]))
  const trait: StructureCoverageRecord[] = buildTraitCoarseRecords(skills).flatMap(group => group.operators.map(member => {
    const operator = operators.get(member.operatorId)!
    const registered = isTraitStructureOperator(operator)
    const structure = traitStructures.get(member.operatorId)
    const concerns: StructureCoverageConcern[] = structure
      ? structure.issues.map(detail => ({ title: 'データの確認', detail }))
      : registered ? [{ title: 'データの確認', detail: '登録された職分の定義と現在のデータの対応を確認できません。' }] : []
    if (structure) {
      const partial = structure.effects.filter(effect => effect.resolution === 'PARTIAL')
      // The trait builder records partial semantics in notes, separately from verification errors.
      if (partial.length) {
        concerns.push(...structure.notes.map(detail => ({ title: '未確定の効果', detail })))
        if (!structure.notes.length && !structure.issues.length) concerns.push(...partial.map(effect => ({
          title: formatTraitStructureEffectItem(effect.item), detail: '効果の定義に未確定の項目があります。',
        })))
      }
    }
    return {
      ...operatorFields(operator), id: `${operator.operatorId}:trait`, kind: 'trait' as const,
      number: null, name: group.subProfessionName, description: group.description,
      categoryLabels: getTraitCoarseCategories(group).map(value => TRAIT_COARSE_CATEGORY_LABELS[value]),
      registered, structureHref: registered ? createTraitStructureHash(operator) : undefined,
      concerns: uniqueConcerns(concerns),
    }
  }))
  return { skill: skill.sort(compareRecords), talent: talent.sort(compareRecords), trait: trait.sort(compareRecords) }
}

export function summarizeStructureCoverage(records: readonly StructureCoverageRecord[]): StructureCoverageSummary {
  const total = records.length
  const registered = records.filter(row => row.registered).length
  return { total, registered, unregistered: total - registered, rate: total ? registered / total * 100 : null }
}

export function filterStructureCoverage(records: readonly StructureCoverageRecord[], filters: StructureCoverageFilters): StructureCoverageRecord[] {
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean)
  return records.filter(row => {
    if (filters.profession !== 'ALL' && row.profession !== filters.profession) return false
    if (filters.rarity !== 'ALL' && row.rarity !== filters.rarity) return false
    if (filters.registration === 'REGISTERED' && !row.registered) return false
    if (filters.registration === 'UNREGISTERED' && row.registered) return false
    const searchable = normalize([row.operatorId, row.operatorName, row.professionLabel, row.jobName,
      row.name, row.description, row.kind === 'talent' ? `素質${row.number}` : '', ...row.categoryLabels].join(' '))
    return terms.every(term => row.kind === 'skill' && /^s\d+$/.test(term)
      ? term === `s${row.number}` : searchable.includes(term))
  })
}

function operatorFields(row: Pick<SkillRecord, 'operatorId' | 'operatorName' | 'profession' | 'professionLabel' | 'rarity' | 'subProfessionName'>) {
  return { operatorId: row.operatorId, operatorName: row.operatorName, profession: row.profession,
    professionLabel: row.professionLabel, rarity: row.rarity, jobName: row.subProfessionName }
}
function talentKey(value: { operatorId: string; talentIndex: number }): string {
  return `${value.operatorId}:talent:${value.talentIndex}`
}
function skillConcerns(structure: SkillStructure): StructureCoverageConcern[] {
  const concerns = getSkillStructureDeferredCases(structure.basicInfo).map(value => ({ title: value.title, detail: value.unresolved }))
  for (const stage of structure.guardRecipe?.stages ?? []) {
    const tracked = stage.calculationIssues ?? []
    // A talent-only calculator limitation is not a skill-structure issue.
    const unresolved = [...tracked.filter(issue => issue.relatedSections.includes('スキル')).map(issue => issue.reason),
      ...(stage.unresolved ?? []).filter(detail => !tracked.some(issue => issue.reason === detail))]
    concerns.push(...unresolved.map(detail => ({ title: stage.label, detail })))
  }
  return concerns
}
function uniqueConcerns(values: StructureCoverageConcern[]): StructureCoverageConcern[] {
  return [...new Map(values.map(value => [`${value.title}\n${value.detail}`, value])).values()]
}
function normalize(value: string): string {
  return value.normalize('NFKC').replace(/<[^>]+>/g, '').replace(/\\n/g, ' ').trim().toLocaleLowerCase('ja')
}
function compareRecords(a: StructureCoverageRecord, b: StructureCoverageRecord): number {
  const order = (value: string) => {
    const index = (PROFESSION_ORDER as readonly string[]).indexOf(value)
    return index < 0 ? PROFESSION_ORDER.length : index
  }
  return order(a.profession) - order(b.profession) || b.rarity - a.rarity
    || a.operatorName.localeCompare(b.operatorName, 'ja') || a.operatorId.localeCompare(b.operatorId)
    || (a.number ?? 0) - (b.number ?? 0) || a.id.localeCompare(b.id)
}

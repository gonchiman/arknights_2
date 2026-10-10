import {
  ACTIVATION_TRIGGER_LABELS,
  EFFECT_WINDOW_LABELS,
} from './classifier.ts'
import type {
  ActivationTriggerType,
  EffectWindowType,
  SkillRecord,
} from '../types/skill.ts'

export interface SkillDirectoryFilters {
  query: string
  profession: string | 'ALL'
  rarity: number | 'ALL'
  effectWindow: EffectWindowType | 'ALL'
  activationTrigger: ActivationTriggerType | 'ALL'
}

export type SkillDirectorySortKey =
  | 'operator'
  | 'skillIndex'
  | 'skill'
  | 'rarity'
  | 'profession'
  | 'subProfession'
  | 'activationTrigger'
  | 'effectWindow'
  | 'duration'
  | 'spType'
  | 'initSp'
  | 'spCost'

export type SortDirection = 'asc' | 'desc'

export interface SkillDirectorySort {
  key: SkillDirectorySortKey
  direction: SortDirection
}

export const EMPTY_SKILL_DIRECTORY_FILTERS: SkillDirectoryFilters = {
  query: '',
  profession: 'ALL',
  rarity: 'ALL',
  effectWindow: 'ALL',
  activationTrigger: 'ALL',
}

export const DEFAULT_SKILL_DIRECTORY_SORT: SkillDirectorySort = {
  key: 'rarity',
  direction: 'desc',
}

export const SKILL_DIRECTORY_SP_TYPE_LABELS: Record<string, string> = {
  INCREASE_WITH_TIME: '自然回復',
  INCREASE_WHEN_ATTACK: '攻撃回復',
  INCREASE_WHEN_TAKEN_DAMAGE: '被撃回復',
  NO_SP: 'SPなし',
  UNKNOWN: '要確認',
}

const JAPANESE_COLLATOR = new Intl.Collator('ja', {
  numeric: true,
  sensitivity: 'base',
})

export function filterSkillDirectoryRows(
  rows: SkillRecord[],
  filters: SkillDirectoryFilters,
): SkillRecord[] {
  const query = normalizeSearchText(filters.query)

  return rows.filter((row) => {
    if (filters.profession !== 'ALL' && row.profession !== filters.profession) return false
    if (filters.rarity !== 'ALL' && row.rarity !== filters.rarity) return false
    if (
      filters.effectWindow !== 'ALL'
      && row.classification.effectWindow.value !== filters.effectWindow
    ) return false
    if (
      filters.activationTrigger !== 'ALL'
      && row.classification.activationTrigger.value !== filters.activationTrigger
    ) return false
    if (!query) return true

    const searchTarget = normalizeSearchText([
      row.operatorName,
      row.skillName,
      row.description,
      row.skillId,
      row.professionLabel,
      row.subProfessionName,
      EFFECT_WINDOW_LABELS[row.classification.effectWindow.value],
      ACTIVATION_TRIGGER_LABELS[row.classification.activationTrigger.value],
    ].join(' '))

    return searchTarget.includes(query)
  })
}

export function sortSkillDirectoryRows(
  rows: SkillRecord[],
  sort: SkillDirectorySort,
): SkillRecord[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const primary = compareRows(a.row, b.row, sort)
      if (primary !== 0) return primary

      const operator = JAPANESE_COLLATOR.compare(a.row.operatorName, b.row.operatorName)
      if (operator !== 0) return operator
      const skillIndex = a.row.skillIndex - b.row.skillIndex
      if (skillIndex !== 0) return skillIndex
      return a.index - b.index
    })
    .map(({ row }) => row)
}

export function filterAndSortSkillDirectoryRows(
  rows: SkillRecord[],
  filters: SkillDirectoryFilters,
  sort: SkillDirectorySort,
): SkillRecord[] {
  return sortSkillDirectoryRows(filterSkillDirectoryRows(rows, filters), sort)
}

export function hasActiveSkillDirectoryFilters(filters: SkillDirectoryFilters): boolean {
  return filters.query.trim() !== ''
    || filters.profession !== 'ALL'
    || filters.rarity !== 'ALL'
    || filters.effectWindow !== 'ALL'
    || filters.activationTrigger !== 'ALL'
}

function compareRows(a: SkillRecord, b: SkillRecord, sort: SkillDirectorySort): number {
  const direction = sort.direction === 'asc' ? 1 : -1

  switch (sort.key) {
    case 'operator':
      return JAPANESE_COLLATOR.compare(a.operatorName, b.operatorName) * direction
    case 'skillIndex':
      return (a.skillIndex - b.skillIndex) * direction
    case 'skill':
      return JAPANESE_COLLATOR.compare(a.skillName, b.skillName) * direction
    case 'rarity':
      return (a.rarity - b.rarity) * direction
    case 'profession':
      return JAPANESE_COLLATOR.compare(a.professionLabel, b.professionLabel) * direction
    case 'subProfession':
      return JAPANESE_COLLATOR.compare(a.subProfessionName, b.subProfessionName) * direction
    case 'activationTrigger':
      return JAPANESE_COLLATOR.compare(
        ACTIVATION_TRIGGER_LABELS[a.classification.activationTrigger.value],
        ACTIVATION_TRIGGER_LABELS[b.classification.activationTrigger.value],
      ) * direction
    case 'effectWindow':
      return JAPANESE_COLLATOR.compare(
        EFFECT_WINDOW_LABELS[a.classification.effectWindow.value],
        EFFECT_WINDOW_LABELS[b.classification.effectWindow.value],
      ) * direction
    case 'duration':
      return compareNullableNumbers(
        getPositiveDuration(a.duration),
        getPositiveDuration(b.duration),
        sort.direction,
      )
    case 'spType':
      return JAPANESE_COLLATOR.compare(
        SKILL_DIRECTORY_SP_TYPE_LABELS[a.spType] ?? a.spType,
        SKILL_DIRECTORY_SP_TYPE_LABELS[b.spType] ?? b.spType,
      ) * direction
    case 'initSp':
      return compareNullableNumbers(a.initSp, b.initSp, sort.direction)
    case 'spCost':
      return compareNullableNumbers(a.spCost, b.spCost, sort.direction)
  }
}

function getPositiveDuration(duration: number | null): number | null {
  return duration !== null && Number.isFinite(duration) && duration > 0 ? duration : null
}

function compareNullableNumbers(
  a: number | null,
  b: number | null,
  direction: SortDirection,
): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return (a - b) * (direction === 'asc' ? 1 : -1)
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja')
}

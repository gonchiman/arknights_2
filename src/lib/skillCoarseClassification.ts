import { classifySkill } from './classifier.ts'
import {
  EMPTY_SKILL_DIRECTORY_FILTERS,
  filterSkillDirectoryRows,
} from './skillDirectory.ts'
import type { SkillRecord } from '../types/skill.ts'

export const SKILL_COARSE_CATEGORIES = [
  'NEXT_ATTACK',
  'SUSTAINED',
  'BURST',
  'MODE',
  'SUMMON',
  'PASSIVE',
  'UNKNOWN',
] as const

export type SkillCoarseCategory = typeof SKILL_COARSE_CATEGORIES[number]

export const SKILL_COARSE_CATEGORY_LABELS: Record<SkillCoarseCategory, string> = {
  NEXT_ATTACK: '次の通常攻撃時',
  SUSTAINED: '持続強化・攻撃変化',
  BURST: '単発・連続攻撃',
  MODE: 'モード切替',
  SUMMON: '召喚・設置',
  PASSIVE: '常時・配置時',
  UNKNOWN: '未分類',
}

export const SKILL_COARSE_CATEGORY_DESCRIPTIONS: Record<SkillCoarseCategory, string> = {
  NEXT_ATTACK: '次の通常攻撃で強化・追加効果を発揮',
  SUSTAINED: '効果時間中、能力や通常攻撃が変化',
  BURST: '発動時・終了時などに単発または連続攻撃',
  MODE: 'モードを切り替えて効果が変化',
  SUMMON: '召喚物や設置物を出す',
  PASSIVE: '常時または配置時に効果を発揮',
  UNKNOWN: '説明文から分類を特定できない効果',
}

export const SKILL_COARSE_CATEGORY_OPTIONS = SKILL_COARSE_CATEGORIES.map((value) => ({
  value,
  label: SKILL_COARSE_CATEGORY_LABELS[value],
}))

export interface SkillCoarseCategorySummary {
  value: SkillCoarseCategory
  label: string
  description: string
  count: number
}

export interface SkillCoarseFilters {
  query: string
  profession: string | 'ALL'
  rarity: number | 'ALL'
  category: SkillCoarseCategory | 'ALL'
}

export const DEFAULT_SKILL_COARSE_FILTERS: SkillCoarseFilters = {
  query: '',
  profession: 'WARRIOR',
  rarity: 6,
  category: 'ALL',
}

const NEXT_ATTACK_VARIANT_PATTERN = /次(?:の|回(?:の)?)(?:通常)?攻撃(?:時|で|が|は)/
const SUSTAINED_CHANGE_PATTERN = /攻撃力|防御力|最大HP|攻撃速度|攻撃間隔|攻撃範囲|攻撃対象|通常攻撃|攻撃時/i
const DIRECT_HIT_PATTERN = /(?:物理|術|確定)(?:範囲)?ダメージ(?:を)?[^。！？\n]{0,45}(?:与え|与える)/
const TIMED_BURST_PATTERN = /(?:スキル発動時|発動後すぐ|即座に|効果時間終了後|スキル終了時)[^。！？\n]{0,200}(?:物理|術|確定)(?:範囲)?ダメージ(?:を)?[^。！？\n]{0,45}(?:与え|与える)/

/** Display-only candidates. These do not change calculator classifications or overrides. */
export function getSkillCoarseCategories(row: SkillRecord): SkillCoarseCategory[] {
  // Read the source rather than row.classification, which may contain calculator overrides.
  const classification = classifySkill(row.raw)
  const description = normalizeText(row.raw.description ?? row.description)
    .replace(/<[^>]+>/g, '')
  const trigger = classification.activationTrigger.value
  const window = classification.effectWindow.value
  const damage = classification.damageComponents.value
  const nextAttack = trigger === 'NEXT_ATTACK' || NEXT_ATTACK_VARIANT_PATTERN.test(description)
  const passive = trigger === 'PASSIVE' || trigger === 'ON_DEPLOY'
  const sustainedWindow = ['FIXED_DURATION', 'AMMO', 'PERMANENT', 'TOGGLE_OR_MODE'].includes(window)
  const candidates = new Set<SkillCoarseCategory>()

  if (nextAttack) candidates.add('NEXT_ATTACK')
  if (
    !nextAttack && !passive && sustainedWindow
    && (damage.includes('BASIC_ATTACK_MODIFIER') || SUSTAINED_CHANGE_PATTERN.test(description))
  ) candidates.add('SUSTAINED')

  // An enhanced next attack is one mechanism, not a second independent burst.
  if (!nextAttack && (
    damage.includes('BURST')
    || (window === 'NONE' && DIRECT_HIT_PATTERN.test(description))
    || TIMED_BURST_PATTERN.test(description)
  )) candidates.add('BURST')

  // TOGGLE_OR_MODE alone also includes a manual stop, which is not a mode switch.
  if (classification.conditions.value.includes('MODE')) candidates.add('MODE')
  if (damage.includes('SUMMON') || damage.includes('DEPLOYED_OBJECT')) candidates.add('SUMMON')
  if (passive) candidates.add('PASSIVE')
  if (candidates.size === 0) candidates.add('UNKNOWN')

  return SKILL_COARSE_CATEGORIES.filter((category) => candidates.has(category))
}

export function summarizeSkillCoarseCategories(rows: SkillRecord[]): SkillCoarseCategorySummary[] {
  const counts = new Map<SkillCoarseCategory, number>()
  for (const row of rows) {
    for (const category of getSkillCoarseCategories(row)) {
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
  }

  return SKILL_COARSE_CATEGORIES.map((value) => ({
    value,
    label: SKILL_COARSE_CATEGORY_LABELS[value],
    description: SKILL_COARSE_CATEGORY_DESCRIPTIONS[value],
    count: counts.get(value) ?? 0,
  }))
}

export function filterSkillCoarseRows(
  rows: SkillRecord[],
  filters: SkillCoarseFilters,
): SkillRecord[] {
  const terms = normalizeText(filters.query).split(/\s+/).filter(Boolean)
  const directoryFilters = {
    ...EMPTY_SKILL_DIRECTORY_FILTERS,
    profession: filters.profession,
    rarity: filters.rarity,
  }

  return filterSkillDirectoryRows(rows, directoryFilters).filter((row) => {
    const categories = getSkillCoarseCategories(row)
    if (filters.category !== 'ALL' && !categories.includes(filters.category)) return false
    if (terms.length === 0) return true

    const categoryText = normalizeText(categories.map((category) => SKILL_COARSE_CATEGORY_LABELS[category]).join(' '))
    return terms.every((term) => {
      if (/^s\d+$/.test(term)) return term === `s${row.skillIndex}`
      return categoryText.includes(term)
        || filterSkillDirectoryRows([row], { ...EMPTY_SKILL_DIRECTORY_FILTERS, query: term }).length > 0
    })
  })
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').replace(/\\n/g, ' ').trim().toLocaleLowerCase('ja')
}

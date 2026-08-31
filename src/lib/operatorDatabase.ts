import { getOperatorPassives } from './operatorProfile.ts'
import { formatSkillEffectDescription } from './skillEffectDetails.ts'
import type {
  OperatorCombatProfile,
  OperatorInitial,
  RawAttributeData,
  RawAttributeKeyFrame,
  SkillRecord,
} from '../types/skill.ts'

export interface OperatorDatabaseStats {
  maxHp: number | null
  attack: number | null
  defense: number | null
  magicResistance: number | null
  deploymentCost: number | null
  blockCount: number | null
  redeployTime: number | null
  attackSpeed: number | null
  attackInterval: number | null
}

export interface OperatorDatabasePotential {
  rank: number
  description: string
}

export interface OperatorDatabaseTalent {
  name: string
  description: string
}

export interface OperatorDatabaseSkill {
  id: string
  index: number
  name: string
  description: string
  initSp: number | null
  spCost: number | null
}

export interface OperatorDatabaseModule {
  id: string
  name: string
  description: string
  typeLabel: string
  unlockLabel: string
}

export interface OperatorDatabaseRecord {
  operatorId: string
  name: string
  nameInitial: OperatorInitial
  rarity: number
  profession: string
  professionLabel: string
  subProfessionId: string
  subProfessionName: string
  stats: OperatorDatabaseStats
  statsCondition: string
  traitDescription: string
  potentials: OperatorDatabasePotential[]
  talents: OperatorDatabaseTalent[]
  skills: OperatorDatabaseSkill[]
  modules: OperatorDatabaseModule[]
}

export interface OperatorDatabaseFilters {
  query: string
  nameInitial: OperatorInitial | 'ALL'
  profession: string | 'ALL'
  rarity: number | 'ALL'
}

export type OperatorDatabaseSortKey =
  | 'operator'
  | 'rarity'
  | 'profession'
  | 'maxHp'
  | 'attack'
  | 'defense'
  | 'magicResistance'

export interface OperatorDatabaseSort {
  key: OperatorDatabaseSortKey
  direction: 'asc' | 'desc'
}

export const EMPTY_OPERATOR_DATABASE_FILTERS: OperatorDatabaseFilters = {
  query: '',
  nameInitial: 'ALL',
  profession: 'ALL',
  rarity: 'ALL',
}

export const DEFAULT_OPERATOR_DATABASE_SORT: OperatorDatabaseSort = {
  key: 'rarity',
  direction: 'desc',
}

const JAPANESE_COLLATOR = new Intl.Collator('ja', {
  numeric: true,
  sensitivity: 'base',
})

export function buildOperatorDatabaseRecords(rows: SkillRecord[]): OperatorDatabaseRecord[] {
  const groups = new Map<string, SkillRecord[]>()

  for (const row of rows) {
    const operatorRows = groups.get(row.operatorId) ?? []
    operatorRows.push(row)
    groups.set(row.operatorId, operatorRows)
  }

  return [...groups.values()].map(buildOperatorRecord)
}

export function filterOperatorDatabaseRecords(
  records: OperatorDatabaseRecord[],
  filters: OperatorDatabaseFilters,
): OperatorDatabaseRecord[] {
  const query = normalizeSearchText(filters.query)

  return records.filter((record) => {
    if (filters.nameInitial !== 'ALL' && record.nameInitial !== filters.nameInitial) return false
    if (filters.profession !== 'ALL' && record.profession !== filters.profession) return false
    if (filters.rarity !== 'ALL' && record.rarity !== filters.rarity) return false
    if (!query) return true

    const searchTarget = normalizeSearchText([
      record.name,
      record.operatorId,
      record.professionLabel,
      record.subProfessionName,
      record.traitDescription,
      ...record.potentials.map((potential) => potential.description),
      ...record.talents.flatMap((talent) => [talent.name, talent.description]),
      ...record.skills.flatMap((skill) => [skill.name, skill.description, skill.id]),
      ...record.modules.flatMap((module) => [module.name, module.description, module.typeLabel]),
    ].join(' '))

    return searchTarget.includes(query)
  })
}

export function sortOperatorDatabaseRecords(
  records: OperatorDatabaseRecord[],
  sort: OperatorDatabaseSort,
): OperatorDatabaseRecord[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const primary = compareRecords(a.record, b.record, sort)
      if (primary !== 0) return primary

      const name = JAPANESE_COLLATOR.compare(a.record.name, b.record.name)
      return name || a.index - b.index
    })
    .map(({ record }) => record)
}

export function filterAndSortOperatorDatabaseRecords(
  records: OperatorDatabaseRecord[],
  filters: OperatorDatabaseFilters,
  sort: OperatorDatabaseSort,
): OperatorDatabaseRecord[] {
  return sortOperatorDatabaseRecords(
    filterOperatorDatabaseRecords(records, filters),
    sort,
  )
}

export function hasActiveOperatorDatabaseFilters(filters: OperatorDatabaseFilters): boolean {
  return filters.query.trim() !== ''
    || filters.nameInitial !== 'ALL'
    || filters.profession !== 'ALL'
    || filters.rarity !== 'ALL'
}

function buildOperatorRecord(operatorRows: SkillRecord[]): OperatorDatabaseRecord {
  const sortedRows = [...operatorRows].sort((a, b) => (
    a.skillIndex - b.skillIndex
    || JAPANESE_COLLATOR.compare(a.skillName, b.skillName)
  ))
  const representative = sortedRows[0]
  const profile = representative.operatorProfile
  const phaseIndex = Math.max(0, profile.phases.length - 1)
  const phase = profile.phases[phaseIndex]
  const operatorLevel = Math.max(1, phase?.maxLevel ?? 1)
  const passives = getOperatorPassives(profile, phaseIndex, operatorLevel)

  return {
    operatorId: representative.operatorId,
    name: representative.operatorName,
    nameInitial: representative.nameInitial,
    rarity: representative.rarity,
    profession: representative.profession,
    professionLabel: representative.professionLabel,
    subProfessionId: representative.subProfessionId,
    subProfessionName: representative.subProfessionName,
    stats: getFinalStats(profile),
    statsCondition: phase
      ? `昇進${phaseIndex} Lv.${operatorLevel}・信頼度100（潜在能力／モジュール補正なし）`
      : '育成ステータスなし',
    traitDescription: passives.traitDescription,
    potentials: (Array.isArray(profile.potentialRanks) ? profile.potentialRanks : []).map((potential, index) => ({
      rank: index + 2,
      description: cleanGameText(potential.description ?? '') || '詳細なし',
    })),
    talents: passives.talents.map((talent) => ({
      name: talent.name,
      description: talent.description || '説明なし',
    })),
    skills: sortedRows.map((skill) => ({
      id: skill.skillId,
      index: skill.skillIndex,
      name: skill.skillName,
      description: cleanGameText(formatSkillEffectDescription(skill)) || '説明なし',
      initSp: skill.initSp,
      spCost: skill.spCost,
    })),
    modules: (Array.isArray(profile.modules) ? profile.modules : [])
      .filter((module) => module.type === 'ADVANCED' && module.uniEquipName)
      .map((module, index) => ({
        id: module.uniEquipId ?? `${representative.operatorId}:module:${index}`,
        name: cleanGameText(module.uniEquipName ?? '') || '名称なし',
        description: cleanGameText(module.uniEquipDesc ?? '') || '説明なし',
        typeLabel: getModuleTypeLabel(module.typeName1, module.typeName2),
        unlockLabel: getModuleUnlockLabel(module.unlockEvolvePhase, module.unlockLevel),
      })),
  }
}

function getFinalStats(profile: OperatorCombatProfile): OperatorDatabaseStats {
  const phase = profile.phases.at(-1)
  const baseFrame = getHighestFrame(phase?.attributesKeyFrames ?? [])
  const trustFrame = getHighestFrame(profile.favorKeyFrames)
  const base = baseFrame?.data
  const trust = trustFrame?.data
  const attackSpeed = addAttributes(base, trust, 'attackSpeed')
  const baseAttackTime = getAttribute(base, 'baseAttackTime')

  return {
    maxHp: roundNullable(addAttributes(base, trust, 'maxHp')),
    attack: roundNullable(addAttributes(base, trust, 'atk')),
    defense: roundNullable(addAttributes(base, trust, 'def')),
    magicResistance: roundNullable(addAttributes(base, trust, 'magicResistance')),
    deploymentCost: roundNullable(getAttribute(base, 'cost')),
    blockCount: roundNullable(getAttribute(base, 'blockCnt')),
    redeployTime: roundNullable(getAttribute(base, 'respawnTime')),
    attackSpeed: roundNullable(attackSpeed),
    attackInterval: baseAttackTime === null || attackSpeed === null || attackSpeed <= 0
      ? null
      : roundTo(baseAttackTime * 100 / attackSpeed, 2),
  }
}

function getHighestFrame(frames: RawAttributeKeyFrame[]): RawAttributeKeyFrame | null {
  return frames.reduce<RawAttributeKeyFrame | null>((latest, frame) => {
    if (!latest) return frame
    return (frame.level ?? -1) >= (latest.level ?? -1) ? frame : latest
  }, null)
}

function addAttributes(
  base: RawAttributeData | undefined,
  addition: RawAttributeData | undefined,
  key: keyof RawAttributeData,
): number | null {
  const baseValue = getAttribute(base, key)
  const additionValue = getAttribute(addition, key)
  if (baseValue === null && additionValue === null) return null
  return (baseValue ?? 0) + (additionValue ?? 0)
}

function getAttribute(
  data: RawAttributeData | undefined,
  key: keyof RawAttributeData,
): number | null {
  const value = data?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function compareRecords(
  a: OperatorDatabaseRecord,
  b: OperatorDatabaseRecord,
  sort: OperatorDatabaseSort,
): number {
  const direction = sort.direction === 'asc' ? 1 : -1

  switch (sort.key) {
    case 'operator':
      return JAPANESE_COLLATOR.compare(a.name, b.name) * direction
    case 'rarity':
      return (a.rarity - b.rarity) * direction
    case 'profession':
      return JAPANESE_COLLATOR.compare(a.professionLabel, b.professionLabel) * direction
    case 'maxHp':
      return compareNullableNumbers(a.stats.maxHp, b.stats.maxHp, sort.direction)
    case 'attack':
      return compareNullableNumbers(a.stats.attack, b.stats.attack, sort.direction)
    case 'defense':
      return compareNullableNumbers(a.stats.defense, b.stats.defense, sort.direction)
    case 'magicResistance':
      return compareNullableNumbers(
        a.stats.magicResistance,
        b.stats.magicResistance,
        sort.direction,
      )
  }
}

function compareNullableNumbers(
  a: number | null,
  b: number | null,
  direction: OperatorDatabaseSort['direction'],
): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return (a - b) * (direction === 'asc' ? 1 : -1)
}

function getModuleTypeLabel(typeName1: string | null | undefined, typeName2: string | null | undefined): string {
  const parts = [typeName1, typeName2].filter((value): value is string => Boolean(value))
  return parts.length > 0 ? parts.join('-') : 'モジュール'
}

function getModuleUnlockLabel(phase: string | null | undefined, level: number | undefined): string {
  const phaseMatch = phase?.match(/(\d+)$/)
  const phaseLabel = phaseMatch ? `昇進${Number(phaseMatch[1])}` : '昇進条件不明'
  return typeof level === 'number' ? `${phaseLabel} Lv.${level}` : phaseLabel
}

function cleanGameText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja')
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : Math.round(value)
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

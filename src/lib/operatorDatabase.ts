import { getOperatorPassives } from './operatorProfile.ts'
import { EMPTY_OPERATOR_FILTERS, type FilterState } from './operatorSearchFilters.ts'
import { formatSkillEffectDescription } from './skillEffectDetails.ts'
import type {
  OperatorCombatProfile,
  OperatorInitial,
  RawAttributeData,
  RawAttributeKeyFrame,
  RawBlackboardCollection,
  RawBlackboardEntry,
  RawOperatorModule,
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
  typeLabel: string
  unlockLabel: string
  effects: OperatorDatabaseModuleEffect[]
}

export interface OperatorDatabaseModuleEffect {
  level: number
  attributeBonuses: string[]
  traitChanges: string[]
  talentChanges: string[]
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

export type OperatorDatabaseFilters = FilterState

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
  ...EMPTY_OPERATOR_FILTERS,
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
    if (filters.subProfession !== 'ALL' && record.subProfessionId !== filters.subProfession) return false
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
      ...record.modules.flatMap((module) => [
        module.name,
        module.typeLabel,
        ...module.effects.flatMap((effect) => [
          ...effect.attributeBonuses,
          ...effect.traitChanges,
          ...effect.talentChanges,
        ]),
      ]),
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
    || filters.subProfession !== 'ALL'
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
        typeLabel: getModuleTypeLabel(module.typeName1, module.typeName2),
        unlockLabel: getModuleUnlockLabel(module.unlockEvolvePhase, module.unlockLevel),
        effects: buildModuleEffects(module),
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

const MODULE_ATTRIBUTE_LABELS: Record<string, string> = {
  max_hp: '最大HP',
  atk: '攻撃力',
  def: '防御力',
  magic_resistance: '術耐性',
  attack_speed: '攻撃速度',
  cost: '配置コスト',
  respawn_time: '再配置時間',
  block_cnt: 'ブロック数',
}

function buildModuleEffects(module: RawOperatorModule): OperatorDatabaseModuleEffect[] {
  if (!Array.isArray(module.phases)) return []

  return module.phases
    .map((phase, index) => {
      const attributeBonuses = normalizeBlackboardEntries(phase.attributeBlackboard)
        .map(formatModuleAttributeBonus)
        .filter((value): value is string => Boolean(value))
      const traitChanges = new Set<string>()
      const talentChanges = new Set<string>()

      for (const part of Array.isArray(phase.parts) ? phase.parts : []) {
        const targetPrefix = part.isToken ? '召喚物：' : ''
        const traitCandidates = selectBasePotentialCandidates(
          part.overrideTraitDataBundle?.candidates,
        )

        for (const candidate of traitCandidates) {
          const descriptions = [
            candidate.overrideDescripton ?? candidate.overrideDescription,
            candidate.additionalDescription,
          ]

          for (const description of descriptions) {
            const formatted = formatModuleDescription(description, candidate.blackboard)
            if (formatted) traitChanges.add(`${targetPrefix}${formatted}`)
          }
        }

        const talentCandidates = selectBasePotentialCandidates(
          part.addOrOverrideTalentDataBundle?.candidates,
        )

        for (const candidate of talentCandidates) {
          const description = formatModuleDescription(
            candidate.upgradeDescription,
            candidate.blackboard,
          )
          if (!description) continue
          const name = cleanGameText(candidate.name ?? '')
          talentChanges.add(`${targetPrefix}${name ? `${name}：` : ''}${description}`)
        }
      }

      return {
        level: typeof phase.equipLevel === 'number' ? phase.equipLevel : index + 1,
        attributeBonuses,
        traitChanges: [...traitChanges],
        talentChanges: [...talentChanges],
      }
    })
    .filter((effect) => (
      effect.attributeBonuses.length > 0
      || effect.traitChanges.length > 0
      || effect.talentChanges.length > 0
    ))
    .sort((a, b) => a.level - b.level)
}

function selectBasePotentialCandidates<T extends { requiredPotentialRank?: number }>(
  candidates: T[] | null | undefined,
): T[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return []
  const minimumRank = Math.min(...candidates.map((candidate) => candidate.requiredPotentialRank ?? 0))
  return candidates.filter((candidate) => (candidate.requiredPotentialRank ?? 0) === minimumRank)
}

function formatModuleAttributeBonus(entry: RawBlackboardEntry): string | null {
  if (!entry.key) return null
  const label = MODULE_ATTRIBUTE_LABELS[entry.key] ?? entry.key
  const value = typeof entry.value === 'number' && Number.isFinite(entry.value)
    ? formatSignedNumber(entry.value)
    : entry.valueStr?.trim()
  if (!value) return null
  const unit = entry.key === 'respawn_time' ? '秒' : ''
  return `${label} ${value}${unit}`
}

function formatModuleDescription(
  description: string | null | undefined,
  blackboard: RawBlackboardCollection | undefined,
): string {
  if (!description?.trim()) return ''
  const values = new Map(normalizeBlackboardEntries(blackboard).flatMap((entry) => (
    entry.key ? [[entry.key, entry] as const] : []
  )))
  const formatted = description.replace(
    /\{(-?[^}:]+)(?::([^}]+))?\}/g,
    (placeholder, rawKey: string, format?: string) => {
      const negative = rawKey.startsWith('-')
      const key = negative ? rawKey.slice(1) : rawKey
      const entry = values.get(rawKey) ?? values.get(key)
      if (!entry) return placeholder
      if (typeof entry.value !== 'number') return entry.valueStr || placeholder
      return formatBlackboardValue(negative ? -entry.value : entry.value, format)
    },
  )
  return cleanGameText(formatted)
}

function normalizeBlackboardEntries(
  blackboard: RawBlackboardCollection | undefined,
): RawBlackboardEntry[] {
  if (Array.isArray(blackboard)) return blackboard
  if (!blackboard || typeof blackboard !== 'object') return []

  return Object.entries(blackboard).map(([key, value]) => ({
    key,
    value: typeof value === 'number' ? value : undefined,
    valueStr: typeof value === 'string' ? value : null,
  }))
}

function formatBlackboardValue(value: number, format?: string): string {
  const percent = format?.includes('%') ?? false
  const decimalMatch = format?.match(/0\.(0+)/)
  const decimals = decimalMatch?.[1].length ?? (format?.includes('0') ? 0 : undefined)
  const normalized = percent ? value * 100 : value
  const formatted = decimals === undefined
    ? formatNumber(normalized)
    : normalized.toFixed(decimals)
  const signed = format?.includes('+') && normalized > 0 ? `+${formatted}` : formatted
  return percent ? `${signed}%` : signed
}

function formatSignedNumber(value: number): string {
  const formatted = formatNumber(value)
  return value > 0 ? `+${formatted}` : formatted
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
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

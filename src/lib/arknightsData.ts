import type {
  RawAttributeKeyFrame,
  RawCharacterPhase,
  RawCharacterTalent,
  RawCharacterTrait,
  RawOperatorModule,
  RawPotentialRank,
  RawSkillLevel,
  SkillRecord,
  SummonCombatSource,
} from '../types/skill'
import { classifySkill } from './classifier'
import { DATA_SOURCE_URLS } from './dataSources.ts'
import { gameDataClient, type GameDataClient } from './gameDataClient.ts'
import { getOperatorAffiliation, getOperatorAffiliationIds, type OperatorAffiliationIds, type OperatorAffiliationTable } from './operatorAffiliation.ts'
import { getOperatorInitial, getProfessionLabel } from './operatorFilters'

export const DATA_URLS = {
  character: DATA_SOURCE_URLS.character,
  skill: DATA_SOURCE_URLS.skill,
  uniequip: DATA_SOURCE_URLS.uniequip,
  battleEquip: DATA_SOURCE_URLS.battleEquip,
  handbookTeam: DATA_SOURCE_URLS.handbookTeam,
}

type CharacterTable = Record<string, OperatorAffiliationIds & {
  name?: string
  description?: string
  displayNumber?: string | null
  rarity?: number | string
  profession?: string
  subProfessionId?: string
  skills?: Array<{ skillId?: string; overrideTokenKey?: string | null }>
  displayTokenDict?: Record<string, boolean>
  phases?: RawCharacterPhase[]
  favorKeyFrames?: RawAttributeKeyFrame[]
  trait?: RawCharacterTrait | null
  talents?: RawCharacterTalent[]
  potentialRanks?: RawPotentialRank[]
}>

type SkillTable = Record<string, {
  levels?: RawSkillLevel[]
}>

interface UniequipTable {
  subProfDict?: Record<string, {
    subProfessionId?: string
    subProfessionName?: string
    traitDesc?: string
  }>
  equipDict?: Record<string, RawOperatorModule & {
    charId?: string
  }>
}

type BattleEquipTable = Record<string, Pick<RawOperatorModule, 'phases'>>

export async function loadSkillRecords(client: GameDataClient = gameDataClient): Promise<SkillRecord[]> {
  const [characters, skills, uniequip, optionalBattleEquips, optionalAffiliations] = await Promise.all([
    client.readTable<CharacterTable>('character'),
    client.readTable<SkillTable>('skill'),
    client.readTable<UniequipTable>('uniequip'),
    client.readTable<BattleEquipTable>('battleEquip', { optional: true }),
    client.readTable<OperatorAffiliationTable>('handbookTeam', { optional: true }),
  ])
  const battleEquips = optionalBattleEquips ?? {}
  const affiliations = optionalAffiliations ?? {}
  const subProfessions = uniequip.subProfDict ?? {}
  const modulesByOperator = buildModulesByOperator(uniequip.equipDict ?? {}, battleEquips)
  const rows: SkillRecord[] = []

  for (const [operatorId, operator] of Object.entries(characters)) {
    // 召喚物やステージギミックも character_table に含まれる。
    // displayNumber を持つプレイアブルなオペレーターだけを対象にする。
    if (!operator.name || !operator.displayNumber || !operator.skills?.length) continue

    const operatorProfile = {
      affiliation: getOperatorAffiliation(operator, affiliations),
      affiliationIds: getOperatorAffiliationIds(operator),
      phases: Array.isArray(operator.phases) ? operator.phases : [],
      favorKeyFrames: Array.isArray(operator.favorKeyFrames) ? operator.favorKeyFrames : [],
      trait: operator.trait ?? null,
      talents: Array.isArray(operator.talents) ? operator.talents : [],
      potentialRanks: Array.isArray(operator.potentialRanks) ? operator.potentialRanks : [],
      modules: modulesByOperator.get(operatorId) ?? [],
      traitDescription: operator.description ?? '',
      subProfessionTraitDescription: subProfessions[operator.subProfessionId ?? 'UNKNOWN']?.traitDesc ?? '',
      ...buildSummonSources(operator, characters, skills),
    }

    operator.skills.forEach((skillRef, index) => {
      const skillId = skillRef.skillId
      if (!skillId) return
      const skill = skills[skillId]
      const level = skill?.levels?.at(-1)
      if (!level) return
      const profession = operator.profession ?? 'UNKNOWN'
      const subProfessionId = operator.subProfessionId ?? 'UNKNOWN'

      rows.push({
        id: `${operatorId}:${skillId}`,
        operatorId,
        operatorName: operator.name ?? operatorId,
        profession,
        professionLabel: getProfessionLabel(profession),
        subProfessionId,
        subProfessionName: subProfessions[subProfessionId]?.subProfessionName ?? subProfessionId,
        nameInitial: getOperatorInitial(operator.name ?? operatorId),
        rarity: parseRarity(operator.rarity),
        skillIndex: index + 1,
        skillId,
        overrideTokenKey: skillRef.overrideTokenKey ?? null,
        skillName: level.name ?? skillId,
        description: stripMarkup(level.description ?? ''),
        duration: typeof level.duration === 'number' ? level.duration : null,
        durationType: level.durationType ?? 'UNKNOWN',
        skillType: level.skillType ?? 'UNKNOWN',
        spType: level.spData?.spType ?? 'UNKNOWN',
        initSp: typeof level.spData?.initSp === 'number' ? level.spData.initSp : null,
        spCost: typeof level.spData?.spCost === 'number' ? level.spData.spCost : null,
        classification: classifySkill(level),
        skillLevels: skill.levels ?? [],
        operatorProfile,
        raw: level,
      })
    })
  }

  return rows.sort((a, b) => b.rarity - a.rarity || a.operatorName.localeCompare(b.operatorName, 'ja') || a.skillIndex - b.skillIndex)
}

/** Keep live summon sources beside their owner, including skill overrides and hidden talents. */
function buildSummonSources(operator: CharacterTable[string], characters: CharacterTable, skills: SkillTable): {
  summonProfiles?: Record<string, SummonCombatSource>; summonSkillTokenKeys?: (string | null)[]
} {
  const keys = new Set([
    ...Object.keys(operator.displayTokenDict ?? {}),
    ...(operator.skills ?? []).flatMap(skill => skill.overrideTokenKey ? [skill.overrideTokenKey] : []),
    ...(operator.talents ?? []).flatMap(talent => (talent.candidates ?? []).flatMap(candidate => candidate.tokenKey ? [candidate.tokenKey] : [])),
  ])
  if (!keys.size) return {}
  const summonProfiles: Record<string, SummonCombatSource> = {}
  for (const tokenKey of keys) {
    const token = characters[tokenKey]
    if (!token) continue
    summonProfiles[tokenKey] = { tokenKey, name: token.name ?? tokenKey, profession: token.profession ?? 'UNKNOWN',
      subProfessionId: token.subProfessionId ?? 'UNKNOWN',
      profile: { phases: token.phases ?? [], favorKeyFrames: Array.isArray(token.favorKeyFrames) ? token.favorKeyFrames : [],
        trait: token.trait ?? null, talents: token.talents ?? [], potentialRanks: Array.isArray(token.potentialRanks) ? token.potentialRanks : [],
        modules: [], traitDescription: token.description ?? '', subProfessionTraitDescription: '' },
      skills: (token.skills ?? []).map(ref => ({ skillId: ref.skillId ?? null, levels: ref.skillId ? skills[ref.skillId]?.levels ?? [] : [] })) }
  }
  return { summonProfiles, summonSkillTokenKeys: (operator.skills ?? []).map(skill => skill.overrideTokenKey ?? null) }
}

function buildModulesByOperator(
  equipDict: NonNullable<UniequipTable['equipDict']>,
  battleEquips: BattleEquipTable,
): Map<string, RawOperatorModule[]> {
  const result = new Map<string, RawOperatorModule[]>()

  for (const module of Object.values(equipDict)) {
    if (!module.charId || !module.uniEquipName || module.type !== 'ADVANCED') continue
    const modules = result.get(module.charId) ?? []
    const battleEquip = module.uniEquipId ? battleEquips[module.uniEquipId] : undefined
    modules.push({
      ...module,
      phases: Array.isArray(battleEquip?.phases) ? battleEquip.phases : [],
    })
    result.set(module.charId, modules)
  }

  result.forEach((modules) => modules.sort((a, b) => (
    (a.charEquipOrder ?? Number.MAX_SAFE_INTEGER) - (b.charEquipOrder ?? Number.MAX_SAFE_INTEGER)
    || (a.uniEquipName ?? '').localeCompare(b.uniEquipName ?? '', 'ja')
  )))

  return result
}

function parseRarity(value: number | string | undefined): number {
  if (typeof value === 'number') return value + 1
  const match = value?.match(/TIER_(\d+)/)
  return match ? Number(match[1]) : 0
}

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

import type {
  RawAttributeKeyFrame,
  RawCharacterPhase,
  RawCharacterTalent,
  RawCharacterTrait,
  RawOperatorModule,
  RawPotentialRank,
  RawSkillLevel,
  SkillRecord,
} from '../types/skill'
import { classifySkill } from './classifier'
import { DATA_SOURCE_URLS } from './dataSources.ts'
import { getOperatorInitial, getProfessionLabel } from './operatorFilters'

export const DATA_URLS = {
  character: DATA_SOURCE_URLS.character,
  skill: DATA_SOURCE_URLS.skill,
  uniequip: DATA_SOURCE_URLS.uniequip,
  battleEquip: DATA_SOURCE_URLS.battleEquip,
}

type CharacterTable = Record<string, {
  name?: string
  description?: string
  displayNumber?: string | null
  rarity?: number | string
  profession?: string
  subProfessionId?: string
  skills?: Array<{ skillId?: string }>
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

export async function loadSkillRecords(): Promise<SkillRecord[]> {
  const [characterResponse, skillResponse, uniequipResponse, battleEquipResponse] = await Promise.all([
    fetch(DATA_URLS.character),
    fetch(DATA_URLS.skill),
    fetch(DATA_URLS.uniequip),
    fetch(DATA_URLS.battleEquip).catch(() => null),
  ])

  if (!characterResponse.ok || !skillResponse.ok || !uniequipResponse.ok) {
    throw new Error('ゲームデータの取得に失敗しました。')
  }

  const characters = await characterResponse.json() as CharacterTable
  const skills = await skillResponse.json() as SkillTable
  const uniequip = await uniequipResponse.json() as UniequipTable
  const battleEquips = await readOptionalBattleEquipTable(battleEquipResponse)
  const subProfessions = uniequip.subProfDict ?? {}
  const modulesByOperator = buildModulesByOperator(uniequip.equipDict ?? {}, battleEquips)
  const rows: SkillRecord[] = []

  for (const [operatorId, operator] of Object.entries(characters)) {
    // 召喚物やステージギミックも character_table に含まれる。
    // displayNumber を持つプレイアブルなオペレーターだけを対象にする。
    if (!operator.name || !operator.displayNumber || !operator.skills?.length) continue

    const operatorProfile = {
      phases: Array.isArray(operator.phases) ? operator.phases : [],
      favorKeyFrames: Array.isArray(operator.favorKeyFrames) ? operator.favorKeyFrames : [],
      trait: operator.trait ?? null,
      talents: Array.isArray(operator.talents) ? operator.talents : [],
      potentialRanks: Array.isArray(operator.potentialRanks) ? operator.potentialRanks : [],
      modules: modulesByOperator.get(operatorId) ?? [],
      traitDescription: operator.description ?? '',
      subProfessionTraitDescription: subProfessions[operator.subProfessionId ?? 'UNKNOWN']?.traitDesc ?? '',
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

async function readOptionalBattleEquipTable(response: Response | null): Promise<BattleEquipTable> {
  if (!response?.ok) return {}

  try {
    const value = await response.json() as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as BattleEquipTable
      : {}
  } catch {
    return {}
  }
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

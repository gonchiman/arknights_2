import type { RawSkillLevel, SkillRecord } from '../types/skill'
import { classifySkill } from './classifier'
import { getOperatorInitial, getProfessionLabel } from './operatorFilters'

const BASE = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/jp/gamedata/excel'

export const DATA_URLS = {
  character: `${BASE}/character_table.json`,
  skill: `${BASE}/skill_table.json`,
  uniequip: `${BASE}/uniequip_table.json`,
}

type CharacterTable = Record<string, {
  name?: string
  displayNumber?: string | null
  rarity?: number | string
  profession?: string
  subProfessionId?: string
  skills?: Array<{ skillId?: string }>
}>

type SkillTable = Record<string, {
  levels?: RawSkillLevel[]
}>

interface UniequipTable {
  subProfDict?: Record<string, {
    subProfessionId?: string
    subProfessionName?: string
  }>
}

export async function loadSkillRecords(): Promise<SkillRecord[]> {
  const [characterResponse, skillResponse, uniequipResponse] = await Promise.all([
    fetch(DATA_URLS.character),
    fetch(DATA_URLS.skill),
    fetch(DATA_URLS.uniequip),
  ])

  if (!characterResponse.ok || !skillResponse.ok || !uniequipResponse.ok) {
    throw new Error('ゲームデータの取得に失敗しました。')
  }

  const characters = await characterResponse.json() as CharacterTable
  const skills = await skillResponse.json() as SkillTable
  const uniequip = await uniequipResponse.json() as UniequipTable
  const subProfessions = uniequip.subProfDict ?? {}
  const rows: SkillRecord[] = []

  for (const [operatorId, operator] of Object.entries(characters)) {
    // 召喚物やステージギミックも character_table に含まれる。
    // displayNumber を持つプレイアブルなオペレーターだけを対象にする。
    if (!operator.name || !operator.displayNumber || !operator.skills?.length) continue

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
        raw: level,
      })
    })
  }

  return rows.sort((a, b) => b.rarity - a.rarity || a.operatorName.localeCompare(b.operatorName, 'ja') || a.skillIndex - b.skillIndex)
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

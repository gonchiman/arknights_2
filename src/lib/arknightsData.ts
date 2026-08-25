import { classifySkill } from './classifier'
import type { RawSkillLevel, SkillRecord } from '../types/skill'

const BASE = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/jp/gamedata/excel'

export const DATA_URLS = {
  character: `${BASE}/character_table.json`,
  skill: `${BASE}/skill_table.json`,
}

type CharacterTable = Record<string, {
  name?: string
  rarity?: number
  skills?: Array<{ skillId?: string }>
}>

type SkillTable = Record<string, {
  levels?: RawSkillLevel[]
}>

export async function loadSkillRecords(): Promise<SkillRecord[]> {
  const [characterResponse, skillResponse] = await Promise.all([
    fetch(DATA_URLS.character),
    fetch(DATA_URLS.skill),
  ])

  if (!characterResponse.ok || !skillResponse.ok) {
    throw new Error('ゲームデータの取得に失敗しました。')
  }

  const characters = await characterResponse.json() as CharacterTable
  const skills = await skillResponse.json() as SkillTable
  const rows: SkillRecord[] = []

  for (const [operatorId, operator] of Object.entries(characters)) {
    if (!operator.name || !operator.skills?.length) continue

    operator.skills.forEach((skillRef, index) => {
      const skillId = skillRef.skillId
      if (!skillId) return
      const skill = skills[skillId]
      const level = skill?.levels?.at(-1)
      if (!level) return

      const classification = classifySkill(level)
      rows.push({
        id: `${operatorId}:${skillId}`,
        operatorId,
        operatorName: operator.name ?? operatorId,
        rarity: (operator.rarity ?? 0) + 1,
        skillIndex: index + 1,
        skillId,
        skillName: level.name ?? skillId,
        description: stripMarkup(level.description ?? ''),
        duration: typeof level.duration === 'number' ? level.duration : null,
        durationType: level.durationType ?? 'UNKNOWN',
        skillType: level.skillType ?? 'UNKNOWN',
        spType: level.spData?.spType ?? 'UNKNOWN',
        spCost: typeof level.spData?.spCost === 'number' ? level.spData.spCost : null,
        ...classification,
        raw: level,
      })
    })
  }

  return rows.sort((a, b) => b.rarity - a.rarity || a.operatorName.localeCompare(b.operatorName, 'ja') || a.skillIndex - b.skillIndex)
}

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

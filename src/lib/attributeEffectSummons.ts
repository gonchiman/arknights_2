import type { SkillRecord } from '../types/skill.ts'
import type { AttributeEffectRow } from './attributeEffectCatalog.ts'
import { getOperatorPassives } from './operatorProfile.ts'

/** Muelsyse's melee copy has one shared debuff across the three summon skill slots. */
export function buildAttributeEffectSummons(rows: readonly SkillRecord[]): AttributeEffectRow[] {
  const owner = rows.find(row => row.operatorId === 'char_249_mlyss')
  if (!owner) return []

  const profile = owner.operatorProfile
  const phaseIndex = profile.phases.length - 1
  const passives = getOperatorPassives(profile, phaseIndex, profile.phases[phaseIndex]?.maxLevel ?? 1, 1)
  const talent = passives.sources.find(source => source.sourceKind === 'TALENT' && source.talentIndex === 0)
  if (talent?.tokenKey !== 'token_10030_mlyss_wtrman') return []
  const summon = profile.summonProfiles?.[talent.tokenKey]
  if (!summon) return []

  const descriptions = summon.skills.map(skill => (skill.levels.at(-1)?.description ?? '').replace(/<[^>]+>/gu, ''))
  const description = descriptions[0]
  const steal = description?.match(/近距離オペレーターの場合は攻撃するたびに敵の攻撃力と防御力を(\d+)ずつ奪取（最大で(\d+)まで奪取可能、再びコピーするとリセットされる）/u)
  if (!steal || !descriptions.every(text => text.includes(steal[0]))) return []

  return [{
    id: `talent:${owner.operatorId}:0:melee-copy-defense-steal`,
    operatorName: owner.operatorName, source: 'talent', sourceLabel: '素質1（召喚物）', name: summon.name,
    attribute: 'physical', effect: '防御力低下', amount: `−${steal[1]}/回`,
    condition: `近距離オペレーターをコピーした召喚物の攻撃時。最大${steal[2]}、再コピー時にリセット`,
    href: null, description,
  }]
}

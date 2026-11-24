import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAttributeEffectSummons } from '../src/lib/attributeEffectSummons.ts'
import { getExpandedSource } from '../src/lib/expandedCombatRegistry.ts'
import type { SkillRecord } from '../src/types/skill.ts'

const source = getExpandedSource('char_249_mlyss')!
const rows = source.skills.map(skill => ({
  operatorId: source.operatorId, operatorName: source.operatorName, operatorProfile: source.profile,
  skillId: skill.skillId, skillIndex: skill.skillIndex,
} as SkillRecord))

test('近距離をコピーしたうつろう水影の防御力奪取を3スキル共通の1効果として掲載する', () => {
  const effects = buildAttributeEffectSummons(rows)
  assert.equal(effects.length, 1)
  const [effect] = effects
  assert.deepEqual([effect.name, effect.sourceLabel, effect.attribute, effect.effect, effect.amount],
    ['うつろう水影', '素質1（召喚物）', 'physical', '防御力低下', '−10/回'])
  assert.match(effect.condition, /近距離.*最大250.*リセット/u)
  assert.match(effect.description!, /敵の攻撃力と防御力を10ずつ奪取/u)
})

test('召喚元の素質や召喚物の効果原文を確認できなければ掲載しない', () => {
  const profile = source.profile
  assert.deepEqual(buildAttributeEffectSummons([{ ...rows[0], operatorProfile: { ...profile, talents: [] } }]), [])
  const key = 'token_10030_mlyss_wtrman'
  const summon = profile.summonProfiles![key]
  const skills = [...summon.skills]
  skills[1] = { ...skills[1], levels: [] }
  const changed = { ...profile, summonProfiles: { [key]: { ...summon, skills } } }
  assert.deepEqual(buildAttributeEffectSummons([{ ...rows[0], operatorProfile: changed }]), [])
})

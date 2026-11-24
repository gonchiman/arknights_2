import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { RawSkillLevel, SkillRecord } from '../src/types/skill.ts'
import { buildAttributeEffectSkills } from '../src/lib/attributeEffectSkills.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'

function skillRecord(group: string, skillId: string): SkillRecord {
  const sources: ExpandedOperatorSource[] = JSON.parse(readFileSync(new URL(`../src/data/${group}Sources.json`, import.meta.url), 'utf8'))
  const source = sources.find(op => op.skills.some(skill => skill.skillId === skillId))!
  const skill = source.skills.find(skill => skill.skillId === skillId)!
  const levels: RawSkillLevel[] = Array.from({ length: source.skillLevelIndex + 1 }, () => ({}))
  levels[source.skillLevelIndex] = skill.raw
  return { operatorId: source.operatorId, operatorName: source.operatorName, skillId,
    skillIndex: skill.skillIndex, skillName: skill.raw.name, skillLevels: levels, raw: skill.raw } as SkillRecord
}

test('uses the last skill level and counts a shared caster/summon debuff once', () => {
  const radian = skillRecord('expandedSummon', 'skchr_radian_3')
  const [row, duplicate] = buildAttributeEffectSkills([radian, radian])
  assert.equal(duplicate, undefined)
  assert.deepEqual([row.sourceLabel, row.attribute, row.effect, row.amount], ['S3', 'arts', '被ダメージ増加', '1.35倍'])
  assert.match(row.condition, /2秒間/)
  assert.match(row.href, /levelIndex=9$/)
})

test('records both enemy debuffs separately and excludes a common attack bonus', () => {
  const pramanix = skillRecord('expandedArts', 'skchr_slbell_2')
  const rows = buildAttributeEffectSkills([pramanix])
  assert.deepEqual(rows.map(r => [r.attribute, r.amount]), [['physical', '-60%'], ['arts', '-30%']])
  assert.notEqual(rows[0].id, rows[1].id)
  assert.deepEqual(buildAttributeEffectSkills([{ ...pramanix, skillId: 'skcom_atk_up_3' }]), [])
})

test('keeps conditional multipliers and reads a deployable debuff from its description', () => {
  const dusk = skillRecord('expandedCaster', 'skchr_dusk_2')
  const ros = skillRecord('expandedRanged', 'skchr_rosmon_3')
  const [amplification, debuff] = buildAttributeEffectSkills([dusk, ros])
  assert.deepEqual([amplification.amount, amplification.condition], ['1.30倍', '対象のHPが50%以下'])
  assert.deepEqual([debuff.attribute, debuff.effect, debuff.amount], ['physical', '防御力低下', '-160'])
  assert.deepEqual(buildAttributeEffectSkills([{ ...dusk, skillLevels: [{ blackboard: [] }] }]), [])
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAttributeEffectTalents } from '../src/lib/attributeEffectTalents.ts'
import { getExpandedSource } from '../src/lib/expandedCombatRegistry.ts'
import { createTalentStructureHash } from '../src/lib/routes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

function skillOf(operatorId: string, skillIndex = 1): SkillRecord {
  const source = getExpandedSource(operatorId)
  assert.ok(source, operatorId)
  return { operatorId, operatorName: source.operatorName, operatorProfile: source.profile, skillIndex } as SkillRecord
}

test('同じ素質をスキル数だけ重複させず、ロゴスの低下と加算を独立して元の素質に結ぶ', () => {
  const operatorId = 'char_4133_logos'
  const rows = buildAttributeEffectTalents([skillOf(operatorId), skillOf(operatorId, 3)])
  assert.deepEqual(rows.map(row => [row.sourceLabel, row.attribute, row.effect, row.amount]), [
    ['素質2', 'arts', '術耐性低下', '−10'], ['素質2', 'arts', '被ダメージ加算（軽減前）', '+150'],
  ])
  assert.equal(new Set(rows.map(row => row.id)).size, 2)
  assert.ok(rows.every(row => row.href === createTalentStructureHash({ operatorId, talentIndex: 1 }) && row.condition.includes('5秒')))
})

test('物理与ダメージと物理被ダメージの対象条件を区別し、属性を持つだけの追加攻撃は除外する', () => {
  const rows = buildAttributeEffectTalents([skillOf('char_1502_crosly'), skillOf('char_379_sesa'), skillOf('char_4080_lin')])
  assert.deepEqual(rows.map(row => [row.name, row.attribute, row.effect, row.amount]), [
    ['王冠を狩る者', 'physical', '与ダメージ増加', '+20%'], ['弱点分析', 'physical', '被ダメージ増加', '+14%'],
  ])
  assert.match(rows[0].condition, /自身にまだダメージを与えていない地上の敵/)
  assert.match(rows[1].condition, /ブロック/)
})

test('検証済みの定義があっても実データに素質が無い場合は掲載しない', () => {
  const skill = skillOf('char_4133_logos')
  const missing = { ...skill, operatorProfile: { ...skill.operatorProfile, talents: [] } }
  assert.deepEqual(buildAttributeEffectTalents([missing]), [])
})

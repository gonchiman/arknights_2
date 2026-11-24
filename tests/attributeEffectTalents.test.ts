import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAttributeEffectTalents } from '../src/lib/attributeEffectTalents.ts'
import { getExpandedSource } from '../src/lib/expandedCombatRegistry.ts'
import { createTalentStructureHash } from '../src/lib/routes.ts'
import type { OperatorTalentRecord, SkillRecord } from '../src/types/skill.ts'

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

test('未装備・潜在1の素質をスキルなしでも掲載し、同一素質の別属性の追加効果を混ぜない', () => {
  const robots: OperatorTalentRecord[] = [
    { operatorId: 'char_4136_phonor', operatorName: 'PhonoR-0', operatorProfile: {
      phases: [{ maxLevel: 30 }], talents: [{ candidates: [
        { name: '河谷より響く斉唱Ⅰ', description: '配置後40秒間、通常攻撃は対象に追加で45の壊死損傷を与え、攻撃範囲内の敵全員に3%の<$ba.magicfragile>【対術脆弱】</>と<$ba.elementfragile>【対元素脆弱】</>を付与',
          requiredPotentialRank: 0, blackboard: [{ key: 'duration', value: 40 }, { key: 'damage_scale', value: 1.03 }] },
        { name: '潜在強化後', requiredPotentialRank: 1, description: '対術脆弱', blackboard: [{ key: 'damage_scale', value: 1.04 }] },
      ] }] } },
    { operatorId: 'char_4227_gallus', operatorName: 'GALLUS²', operatorProfile: {
      phases: [{ maxLevel: 30 }], talents: [{ candidates: [
        { name: '「捕まえてみな」', description: '配置後20秒間、攻撃時、10秒間対象の術耐性-15%、この効果中でない敵を優先して攻撃',
          blackboard: [{ key: 'duration', value: 20 }, { key: 'buff_duration', value: 10 }, { key: 'magic_resistance', value: -0.15 }] },
      ] }] } },
  ]
  const rows = buildAttributeEffectTalents([], robots)
  assert.deepEqual(rows.map(r => [r.name, r.attribute, r.effect, r.amount, r.condition]), [
    ['河谷より響く斉唱Ⅰ', 'arts', '被ダメージ増加', '+3%', '配置後40秒間、攻撃範囲内の敵全員'],
    ['「捕まえてみな」', 'arts', '術耐性低下', '−15%', '配置後20秒間、攻撃した敵に10秒間'],
  ])
  assert.ok(rows.every(r => r.href === null && r.description && !r.description.includes('<')))
})

test('怒潮ズィマーは最大昇進時の特性の与ダメージ増加を1件として掲載する', () => {
  const candidate = { name: '渦巻く激情', description: '特性による範囲物理攻撃の与ダメージ+24%。攻撃時、ダメージ発生範囲内の高台が隣接4マスの地上の敵全員に攻撃力の24%の物理ダメージを与える',
    blackboard: [{ key: 'damage_scale', value: 1.24 }, { key: 'attack@splash_atk_scale', value: 0.24 }] }
  const operator: OperatorTalentRecord = { operatorId: 'char_1051_headb2', operatorName: '怒潮ズィマー', operatorProfile: {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90 }],
    talents: [{ candidates: [
      { ...candidate, unlockCondition: { phase: 'PHASE_2', level: 1 }, description: candidate.description + '、0.5秒間足止めする' },
      { ...candidate, unlockCondition: { phase: 'PHASE_1', level: 1 } },
    ] }],
  } }
  const rows = buildAttributeEffectTalents([operator as SkillRecord, operator as SkillRecord], [operator])
  assert.deepEqual(rows.map(r => [r.attribute, r.effect, r.amount]), [['physical', '与ダメージ増加', '+24%']])
  assert.match(rows[0].description ?? '', /足止め/)
})

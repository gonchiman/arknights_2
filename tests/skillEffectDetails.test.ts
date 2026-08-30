import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSkillEffectDetails, formatSkillEffectDescription } from '../src/lib/skillEffectDetails.ts'
import type { SkillRecord } from '../src/types/skill.ts'

test('最大レベルの発動情報と分類をモーダル向けに整形する', () => {
  const details = buildSkillEffectDetails(createSkill())

  assert.deepEqual(details, {
    activation: '手動発動',
    effectWindow: '固定時間（12.5秒）',
    spRecovery: '自然回復',
    initialSp: '10',
    requiredSp: '25',
    damageComponents: ['通常攻撃変化', '瞬間・連続攻撃'],
    conditions: ['オーバーチャージ'],
    outputs: ['1ヒット', 'DPS', '効果時間総量'],
  })
})

test('時間・SP・条件・直接出力がない場合も読みやすい表示へ変換する', () => {
  const skill = createSkill()
  skill.duration = -1
  skill.spType = 'UNKNOWN'
  skill.initSp = null
  skill.spCost = null
  skill.classification.effectWindow.value = 'AMMO'
  skill.classification.conditions.value = []
  skill.classification.outputCapabilities = {
    canShowPerHit: false,
    canShowPerActivationTotal: false,
    canShowDps: false,
    canShowWindowTotal: false,
    canShowSteadyStateDps: false,
    requiresModeSelection: false,
    requiresManualModel: false,
  }

  const details = buildSkillEffectDetails(skill)

  assert.equal(details.effectWindow, '弾薬制')
  assert.equal(details.spRecovery, '要確認')
  assert.equal(details.initialSp, '—')
  assert.equal(details.requiredSp, '—')
  assert.deepEqual(details.conditions, ['なし'])
  assert.deepEqual(details.outputs, ['直接出力なし'])
})

test('説明文のゲームデータ変数を最大レベルの実数へ展開する', () => {
  const skill = createSkill()
  skill.description = '防御力+{def:0%}、{stun}秒間スタン、攻撃間隔{-interval:0.0}秒。{unknown}は保持'
  skill.raw = {
    blackboard: [
      { key: 'def', value: 0.5 },
      { key: 'stun', value: 3 },
      { key: 'interval', value: 0.35 },
    ],
  }

  assert.equal(
    formatSkillEffectDescription(skill),
    '防御力+50%、3秒間スタン、攻撃間隔-0.3秒。{unknown}は保持',
  )
})

test('説明文が空の場合はフォールバックを返す', () => {
  const skill = createSkill()
  skill.description = '  '
  assert.equal(formatSkillEffectDescription(skill), '説明文なし')
})

function createSkill(): SkillRecord {
  return {
    duration: 12.5,
    spType: 'INCREASE_WITH_TIME',
    initSp: 10,
    spCost: 25,
    classification: {
      effectWindow: { value: 'FIXED_DURATION' },
      activationTrigger: { value: 'MANUAL' },
      damageComponents: { value: ['BASIC_ATTACK_MODIFIER', 'BURST'] },
      conditions: { value: ['OVERCHARGE'] },
      outputCapabilities: {
        canShowPerHit: true,
        canShowPerActivationTotal: false,
        canShowDps: true,
        canShowWindowTotal: true,
        canShowSteadyStateDps: false,
        requiresModeSelection: false,
        requiresManualModel: false,
      },
    },
  } as SkillRecord
}

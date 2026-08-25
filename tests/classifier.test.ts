import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySkill } from '../src/lib/classifier.ts'
import type { RawSkillLevel } from '../src/types/skill.ts'

const classify = (level: RawSkillLevel) => classifySkill(level)

test('バグパイプS2: 次回攻撃の1回出力として分類する', () => {
  const result = classify({
    description: '次の通常攻撃時、攻撃力が{atk_scale:0%}まで上昇し、追加でもう一度攻撃する {cnt}回チャージ可能',
    duration: 0,
    durationType: 'NONE',
    skillType: 'AUTO',
  })

  assert.equal(result.effectWindow.value, 'NONE')
  assert.equal(result.activationTrigger.value, 'NEXT_ATTACK')
  assert.deepEqual(result.damageComponents.value, ['BASIC_ATTACK_MODIFIER'])
  assert.deepEqual(result.conditions.value, ['CHARGE'])
  assert.equal(result.outputCapabilities.canShowPerHit, true)
  assert.equal(result.outputCapabilities.canShowPerActivationTotal, true)
  assert.equal(result.outputCapabilities.canShowDps, false)
})

test('W S2: オペレーター本体の攻撃変化ではなく設置物として分類する', () => {
  const result = classify({
    description: '次の通常攻撃時、攻撃範囲内の配置可能マスに存続時間120秒の地雷を設置。敵が地雷の付近にいる時、地雷が爆発し、周囲一定範囲内の敵全員に攻撃力の{atk_scale:0%}の物理ダメージを与える',
    duration: 0,
    durationType: 'NONE',
    skillType: 'AUTO',
  })

  assert.equal(result.effectWindow.value, 'NONE')
  assert.equal(result.activationTrigger.value, 'NEXT_ATTACK')
  assert.deepEqual(result.damageComponents.value, ['DEPLOYED_OBJECT'])
  assert.equal(result.outputCapabilities.canShowPerActivationTotal, true)
  assert.equal(result.outputCapabilities.canShowDps, false)
})

test('アイリーニS3: 継続枠なしの連続攻撃として分類する', () => {
  const result = classify({
    description: '周囲の敵に攻撃力の{atk_scale:0%}の物理ダメージを与える。その後素早く{multi_times}回砲撃を行い、砲撃するたびに攻撃力の{multi_atk_scale:0%}の物理範囲ダメージを与える',
    duration: 0,
    durationType: 'NONE',
    skillType: 'MANUAL',
  })

  assert.equal(result.effectWindow.value, 'NONE')
  assert.equal(result.activationTrigger.value, 'MANUAL')
  assert.deepEqual(result.damageComponents.value, ['BURST'])
  assert.equal(result.outputCapabilities.canShowPerHit, true)
  assert.equal(result.outputCapabilities.canShowPerActivationTotal, true)
  assert.equal(result.outputCapabilities.canShowDps, false)
})

test('バグパイプS3: 固定時間の通常攻撃変化としてDPSと総量を許可する', () => {
  const result = classify({
    description: '攻撃間隔を延長。ブロック数+1、攻撃力、防御力+120%、通常攻撃が3連撃になる',
    duration: 20,
    durationType: 'NONE',
    skillType: 'MANUAL',
  })

  assert.equal(result.effectWindow.value, 'FIXED_DURATION')
  assert.equal(result.activationTrigger.value, 'MANUAL')
  assert.deepEqual(result.damageComponents.value, ['BASIC_ATTACK_MODIFIER'])
  assert.equal(result.outputCapabilities.canShowDps, true)
  assert.equal(result.outputCapabilities.canShowWindowTotal, true)
})

test('ホルンS2: 弾薬制とオーバードライブを独立して保持する', () => {
  const result = classify({
    description: '通常攻撃が敵に攻撃力の240%の物理範囲ダメージを与える オーバードライブ：通常攻撃時、追加で術範囲ダメージを与え、手動で停止すると残り全ての弾薬を発射する 弾薬数は10発、手動でスキルを停止可能',
    duration: -1,
    durationType: 'AMMO',
    skillType: 'MANUAL',
  })

  assert.equal(result.effectWindow.value, 'AMMO')
  assert.equal(result.activationTrigger.value, 'MANUAL')
  assert.deepEqual(result.damageComponents.value, ['BASIC_ATTACK_MODIFIER'])
  assert.deepEqual(result.conditions.value, ['PHASE'])
  assert.equal(result.outputCapabilities.canShowDps, true)
  assert.equal(result.outputCapabilities.canShowWindowTotal, true)
  assert.equal(result.outputCapabilities.requiresModeSelection, true)
})

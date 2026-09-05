import test from 'node:test'
import assert from 'node:assert/strict'
import { convertSkillDescription } from '../src/lib/skillDescriptionEffects.ts'
import { formatSkillDescriptionEffectValue } from '../src/lib/skillDescriptionEffectFormat.ts'

test('加算量・変更後の値・倍率・確率はそれぞれの意味に合わせて表示する', () => {
  const result = convertSkillDescription('浮遊ユニットの数+2。ブロック数が0になる。防御力が10になる。攻撃力が150%まで上昇。攻撃力+50%。攻撃速度+30。30%の確率で対象を2秒間足止めする')
  const formatted = new Map(result.effects.map(e => [e.key, formatSkillDescriptionEffectValue(e)]))
  assert.equal(formatted.get('floatingUnitCountBonus'), '+2体')
  assert.equal(formatted.get('blockCount'), '0体')
  assert.equal(formatted.get('defenseSetValue'), '10')
  assert.equal(formatted.get('attackPowerMultiplier'), '1.5倍')
  assert.equal(formatted.get('attackPowerBonusRatio'), '+50%')
  assert.equal(formatted.get('attackSpeedBonus'), '+30')
  assert.equal(formatted.get('effectProbability'), '30%')
  assert.equal(formatted.get('slowDurationSeconds'), '2秒')
})

test('回復割合・回復速度・元素ダメージ・マス数を単独の値として表示する', () => {
  const result = convertSkillDescription('HPが最大値の20%回復。HPが毎秒最大値の5%回復。SP回復速度+1sp/秒。攻撃力の120%の元素ダメージ。攻撃範囲+2マス')
  const formatted = new Map(result.effects.map(e => [e.key, formatSkillDescriptionEffectValue(e)]))
  assert.equal(formatted.get('maxHpRecoveryRatio'), '20%')
  assert.equal(formatted.get('maxHpRecoveryRatioPerSecond'), '5%/秒')
  assert.equal(formatted.get('spRecoveryRateBonus'), '+1SP/秒')
  assert.equal(formatted.get('damageType'), '元素')
  assert.equal(formatted.get('attackRangeExtension'), '+2マス')
})

test('弾薬・投擲物・矢の数を攻撃回数の単位で表示しない', () => {
  const result = convertSkillDescription('弾薬を3発補充。同時に2個の旋回投擲物を放つ。攻撃するたびに矢を2本放つ。攻撃時に旋回投擲物を追加で1個放つ')
  assert.deepEqual(result.effects.map(formatSkillDescriptionEffectValue), ['3発', '2個', '2本', '+1個'])
})

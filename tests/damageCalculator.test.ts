import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateDamage,
  calculateSkillDamage,
  deriveSkillModel,
  getOperatorStats,
} from '../src/lib/damageCalculator.ts'

test('物理・術・確定ダメージへ敵防御を正しく適用する', () => {
  assert.equal(calculateDamage(1000, 'PHYSICAL', 300, 0), 700)
  assert.equal(calculateDamage(1000, 'PHYSICAL', 2000, 0), 50)
  assert.equal(calculateDamage(1000, 'ARTS', 0, 30), 700)
  assert.equal(calculateDamage(1000, 'TRUE', 2000, 100), 1000)
})

test('レベルと信頼度から攻撃力・攻撃間隔を補間する', () => {
  const stats = getOperatorStats({
    phases: [{
      maxLevel: 50,
      attributesKeyFrames: [
        { level: 1, data: { atk: 100, attackSpeed: 100, baseAttackTime: 1.2 } },
        { level: 50, data: { atk: 200, attackSpeed: 100, baseAttackTime: 1.2 } },
      ],
    }],
    favorKeyFrames: [
      { level: 0, data: { atk: 0 } },
      { level: 50, data: { atk: 20 } },
    ],
  }, 0, 50, 100)

  assert.equal(stats.attack, 220)
  assert.equal(stats.attackInterval, 1.2)
})

test('Ash S1型のblackboardから攻撃倍率と連撃数を得る', () => {
  const model = deriveSkillModel({
    duration: -1,
    durationType: 'NONE',
    blackboard: [
      { key: 'atk', value: 0.15 },
      { key: 'attack@times', value: 2 },
    ],
  }, 1)

  assert.equal(model.attackMultiplierPercent, 115)
  assert.equal(model.hitCount, 2)
  assert.equal(model.attackInterval, 1)
})

test('固定時間スキルの1ヒット・DPS・総量を計算する', () => {
  const output = calculateSkillDamage(1000, 'PHYSICAL', 200, 0, {
    attackMultiplierPercent: 120,
    hitCount: 2,
    attackInterval: 2,
    duration: 10,
    ammoCount: 0,
  }, {
    canShowDps: true,
    totalMode: 'DURATION',
  })

  assert.equal(output.perHit, 1000)
  assert.equal(output.perAttack, 2000)
  assert.equal(output.dps, 1000)
  assert.equal(output.total, 10000)
})

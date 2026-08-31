import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateDamage,
  calculateDamageBreakdown,
  calculateSkillDamageBreakdown,
  deriveSkillModel,
  getOperatorStats,
} from '../src/lib/damageCalculator.ts'

test('無条件の攻撃速度補正を基礎攻撃速度と分けて保持する', () => {
  const stats = getOperatorStats({
    phases: [{
      maxLevel: 1,
      attributesKeyFrames: [
        { level: 1, data: { atk: 100, attackSpeed: 100, baseAttackTime: 1 } },
      ],
    }],
    favorKeyFrames: [],
  }, 0, 1, 0, { attackSpeedBonus: 12 })

  assert.equal(stats.baseAttackSpeed, 100)
  assert.equal(stats.attackSpeedBonus, 12)
  assert.equal(stats.attackSpeed, 112)
  assert.ok(Math.abs(stats.attackInterval - 100 / 112) < 1e-12)
})

test('素質とスキルの攻撃速度補正を加算して攻撃間隔を求める', () => {
  const model = deriveSkillModel({
    blackboard: [{ key: 'attack_speed', value: 30 }],
  }, 100 / 112, 112)

  assert.equal(model.attackInterval, 0.704)
})

test('固定防御力・術耐性無視を軽減前に適用する', () => {
  const physical = calculateDamageBreakdown(1000, 'PHYSICAL', 500, 0, {
    defenseIgnoreFixed: 100,
  })
  assert.equal(physical.inputDefense, 500)
  assert.equal(physical.defenseBeforeIgnore, 500)
  assert.equal(physical.defenseIgnoreFixed, 100)
  assert.equal(physical.appliedDefense, 400)
  assert.equal(physical.result, 600)

  const arts = calculateDamageBreakdown(1000, 'ARTS', 0, 50, {
    resistanceIgnoreFixed: 20,
  })
  assert.equal(arts.inputResistance, 50)
  assert.equal(arts.resistanceBeforeIgnore, 50)
  assert.equal(arts.resistanceIgnoreFixed, 20)
  assert.equal(arts.appliedResistance, 30)
  assert.equal(arts.result, 700)

  assert.equal(calculateDamage(1000, 'PHYSICAL', 500, 0, { defenseIgnoreFixed: 100 }), 600)
})

test('固定無視の適用後にも最低保証ダメージを適用する', () => {
  const physical = calculateDamageBreakdown(1000, 'PHYSICAL', 2000, 0, {
    defenseIgnoreFixed: 100,
  })
  assert.equal(physical.appliedDefense, 1900)
  assert.equal(physical.minimumApplied, true)
  assert.equal(physical.result, 50)

  const arts = calculateDamageBreakdown(1000, 'ARTS', 0, 100, {
    resistanceIgnoreFixed: 2,
  })
  assert.equal(arts.appliedResistance, 98)
  assert.equal(arts.minimumApplied, true)
  assert.equal(arts.result, 50)
})

test('passive A・Bとskill B・Eを既存の計算順へ合流する', () => {
  const breakdown = calculateSkillDamageBreakdown(1000, 'TRUE', 0, 0, {
    directMultiplierPercent: 50,
    attackScalePercent: 200,
    hitCount: 1,
    attackInterval: 1,
    duration: 10,
    ammoCount: 0,
  }, {
    canShowDps: true,
    totalMode: 'DURATION',
    attackModifiers: {
      directAddition: 100,
      directMultiplierPercent: 20,
    },
  })

  assert.equal(breakdown.attackPipeline.afterDirectAddition, 1100)
  assert.equal(breakdown.attackPipeline.directMultiplierPercent, 70)
  assert.equal(breakdown.attackPipeline.afterDirectMultiplier, 1870)
  assert.equal(breakdown.attackPipeline.afterFinalMultiplier, 1870)
  assert.equal(breakdown.attackPipeline.attackScale, 2)
  assert.equal(breakdown.attackPipeline.finalAttack, 3740)
  assert.equal(breakdown.perHit, 3740)
  assert.equal(breakdown.dps, 3740)
  assert.equal(breakdown.total, 37400)
})

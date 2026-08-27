import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateDamage,
  calculateDamageBreakdown,
  calculateSkillDamage,
  calculateSkillDamageBreakdown,
  deriveSkillModel,
  getDefaultDamageType,
  getOperatorStats,
} from '../src/lib/damageCalculator.ts'
import { getOperatorPassives } from '../src/lib/operatorProfile.ts'

test('物理・術・確定ダメージへ敵防御を正しく適用する', () => {
  assert.equal(calculateDamage(1000, 'PHYSICAL', 300, 0), 700)
  assert.equal(calculateDamage(1000, 'PHYSICAL', 2000, 0), 50)
  assert.equal(calculateDamage(1000, 'ARTS', 0, 30), 700)
  assert.equal(calculateDamage(1000, 'TRUE', 2000, 100), 1000)
})

test('物理最低保証と術耐性上限を計算過程として返す', () => {
  const physical = calculateDamageBreakdown(1000, 'PHYSICAL', 2000, 0)
  assert.equal(physical.afterDefense, -1000)
  assert.equal(physical.minimumDamage, 50)
  assert.equal(physical.minimumApplied, true)
  assert.equal(physical.result, 50)

  const arts = calculateDamageBreakdown(1000, 'ARTS', 0, 100)
  assert.equal(arts.inputResistance, 100)
  assert.equal(arts.appliedResistance, 95)
  assert.ok(Math.abs(arts.result - 50) < 1e-9)
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

test('スキルの倍率・軽減・ヒット数・総量を同じ計算過程で返す', () => {
  const breakdown = calculateSkillDamageBreakdown(1000, 'PHYSICAL', 200, 0, {
    attackMultiplierPercent: 120,
    hitCount: 2,
    attackInterval: 2,
    duration: 10,
    ammoCount: 0,
  }, {
    canShowDps: true,
    totalMode: 'DURATION',
  })

  assert.equal(breakdown.scaledAttack, 1200)
  assert.equal(breakdown.mitigation.afterDefense, 1000)
  assert.equal(breakdown.perHit, 1000)
  assert.equal(breakdown.perAttack, 2000)
  assert.equal(breakdown.dps, 1000)
  assert.equal(breakdown.total, 10000)
  assert.equal(breakdown.totalMode, 'DURATION')
})

test('現在の昇進段階で解放済みかつ潜在強化前の特性・素質を選ぶ', () => {
  const passives = getOperatorPassives({
    phases: [],
    favorKeyFrames: [],
    traitDescription: '通常攻撃が術ダメージを与える',
    trait: { candidates: [{ unlockCondition: { phase: 'PHASE_0', level: 1 }, requiredPotentialRank: 0 }] },
    talents: [{ candidates: [
      { unlockCondition: { phase: 'PHASE_1', level: 1 }, requiredPotentialRank: 0, name: '素質A', description: '基本効果' },
      { unlockCondition: { phase: 'PHASE_1', level: 1 }, requiredPotentialRank: 4, name: '素質A', description: '潜在強化' },
      { unlockCondition: { phase: 'PHASE_2', level: 1 }, requiredPotentialRank: 0, name: '素質A', description: '昇進2効果' },
    ] }],
  }, 1, 80)

  assert.equal(passives.traitDescription, '通常攻撃が術ダメージを与える')
  assert.deepEqual(passives.talents, [{ name: '素質A', description: '基本効果' }])
})

test('オペレーターの特性を優先して初期ダメージ種別を決める', () => {
  assert.equal(getDefaultDamageType('WARRIOR', '敵に術ダメージを与える'), 'ARTS')
  assert.equal(getDefaultDamageType('CASTER', '敵に物理ダメージを与える'), 'PHYSICAL')
  assert.equal(getDefaultDamageType('SNIPER'), 'PHYSICAL')
})

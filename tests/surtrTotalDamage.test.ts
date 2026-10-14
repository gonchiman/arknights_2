import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import type { SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import { calculateSurtrDpsCalculation } from '../src/lib/surtrDpsCalculation.ts'
import { calculateSurtrRemnantAttacks } from '../src/lib/surtrRemnantAttacks.ts'
import {
  buildSurtrTotalDamageTimeSamples,
  calculateSurtrTotalDamage,
  deriveSurtrTotalDamageModel,
  SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS,
  type SurtrTotalDamageAssumptions,
  type SurtrTotalDamageModel,
} from '../src/lib/surtrTotalDamage.ts'
import type { RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

const settings: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }
const xId = 'uniequip_002_surtr'
const yId = 'uniequip_003_surtr'

function derive(moduleId = '', changes: Partial<SurtrDpsSettings> = {}, moduleLevel = 3) {
  const model = deriveSurtrTotalDamageModel(createRecord(), { ...settings, ...changes }, moduleId, moduleLevel)
  assert.ok(model)
  return model
}

function calculate(model = derive(), time = 25, changes: Partial<SurtrTotalDamageAssumptions> = {}) {
  const result = calculateSurtrTotalDamage(model, time, 0, { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, ...changes })
  assert.ok(result)
  return result
}

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)
}

function synthetic(beforeInterval = 1, afterInterval = 1, duration = 2): SurtrTotalDamageModel {
  const model = derive()
  model.before = { ...model.before, attackInterval: beforeInterval, effectiveAttack: 100 }
  model.after = { ...model.after, attackInterval: afterInterval, effectiveAttack: 100 }
  model.timing = { ...model.timing, attackIntervalBefore: beforeInterval,
    attackIntervalAfter: afterInterval, remnantDuration: duration }
  return model
}

test('発動直前に開始した攻撃の命中を引き継ぎ、CT単独計算で落ちる1回を含める', () => {
  const model = derive()
  const result = calculate(model, 10.7)
  assert.equal(result.hitsBefore, 8)
  assert.equal(result.hitsRemnant, 7)
  assert.equal(result.totalHits, 15)
  const crossing = result.attacks.filter(attack => attack.carriedImpact)
  assert.equal(crossing.length, 1)
  close(crossing[0].startTime, 10.6)
  close(crossing[0].hitTime, 10.9)
  assert.equal(crossing[0].phase, 'remnant')
  close(result.remainingCtBefore, 1.15)
  close(result.remainingCtAfter, 1.15)
  const isolated = calculateSurtrRemnantAttacks(model.timing, result.remainingCtBefore,
    { windup: 0.3, ctCarry: 'time', includeRetreatHit: false })!
  assert.equal(isolated.hitCount, 6)
  assert.equal(result.hitsRemnant, isolated.hitCount + 1)
})

test('命中までの遅延は開始時刻ごとに足し、攻撃間隔へ加算しない', () => {
  const model = synthetic()
  const immediate = calculate(model, 3, { firstAttackStart: 0, hitDelay: 0 })
  const delayed = calculate(model, 3, { firstAttackStart: 0, hitDelay: 0.3 })
  assert.deepEqual(immediate.attacks.map(attack => attack.startTime), [0, 1, 2, 3, 4])
  assert.deepEqual(delayed.attacks.map(attack => attack.startTime), [0, 1, 2, 3, 4])
  assert.deepEqual(delayed.attacks.map(attack => attack.hitTime), [0.3, 1.3, 2.3, 3.3, 4.3])
  assert.equal(immediate.totalHits, delayed.totalHits)
})

test('CT秒数維持と割合維持は次の開始時刻だけを変え、進行中の命中は変えない', () => {
  const model = synthetic(1.25, 0.625, 3)
  const time = calculate(model, 0.8)
  const ratio = calculate(model, 0.8, { ctCarry: 'ratio' })
  close(time.remainingCtBefore, 1.05)
  close(time.remainingCtAfter, 1.05)
  close(ratio.remainingCtAfter, 0.525)
  close(time.attacks.find(attack => !attack.startedBeforeRemnant)!.startTime, 1.85)
  close(ratio.attacks.find(attack => !attack.startedBeforeRemnant)!.startTime, 1.325)
  const carriedTime = time.attacks.find(attack => attack.carriedImpact)!
  const carriedRatio = ratio.attacks.find(attack => attack.carriedImpact)!
  assert.deepEqual(carriedTime, carriedRatio)
  close(carriedTime.startTime, 0.6)
  close(carriedTime.hitTime, 0.9)
})

test('素質2と同時の命中は素質2中、同時の攻撃開始は発動後の攻撃間隔を使う', () => {
  const model = synthetic(1, 0.5, 2)
  model.after.effectiveAttack = 200
  const boundaryHit = calculate(model, 0.9)
  assert.equal(boundaryHit.attacks[0].phase, 'remnant')
  assert.equal(boundaryHit.attacks[0].carriedImpact, true)
  assert.equal(boundaryHit.attacks[0].hitTime, 0.9)
  assert.equal(boundaryHit.attacks[0].damage, 200)
  assert.equal(boundaryHit.hitsBefore, 0)
  const boundaryStart = calculate(model, 1.6)
  const atActivation = boundaryStart.attacks.find(attack => attack.startTime === 1.6)!
  assert.equal(atActivation.startedBeforeRemnant, false)
  const afterStarts = boundaryStart.attacks.filter(attack => !attack.startedBeforeRemnant).map(attack => attack.startTime)
  assert.deepEqual(afterStarts, [1.6, 2.1, 2.6, 3.1])
  assert.equal(boundaryStart.remainingCtBefore, 0)
})

test('退場と同時の命中は選択に従い、退場と同時の開始や退場後の命中は数えない', () => {
  const model = synthetic(1, 1, 2)
  const excluded = calculate(model, 0, { firstAttackStart: 0, hitDelay: 1 })
  const included = calculate(model, 0, { firstAttackStart: 0, hitDelay: 1, includeRetreatHit: true })
  assert.deepEqual(excluded.attacks.map(attack => [attack.startTime, attack.hitTime]), [[0, 1]])
  assert.deepEqual(included.attacks.map(attack => [attack.startTime, attack.hitTime]), [[0, 1], [1, 2]])
  const zeroDelay = calculate(model, 0, { firstAttackStart: 0, hitDelay: 0, includeRetreatHit: true })
  assert.deepEqual(zeroDelay.attacks.map(attack => attack.startTime), [0, 1])
  const afterRetreat = calculate(model, 0, { firstAttackStart: 0.6, hitDelay: 0.5, includeRetreatHit: true })
  assert.deepEqual(afterRetreat.attacks.map(attack => attack.hitTime), [1.1])
})

test('発動時刻0や初回攻撃より前の発動は初回開始を維持し、以後は発動後の間隔を使う', () => {
  const model = synthetic(1, 0.5, 2)
  for (const time of [0, 0.2, 0.6]) {
    const result = calculate(model, time, { ctCarry: 'ratio' })
    assert.equal(result.hitsBefore, 0)
    assert.equal(result.attacks[0].startTime, 0.6)
    close(result.attacks[1].startTime, 1.1)
    close(result.remainingCtBefore, 0.6 - time)
    close(result.remainingCtAfter, 0.6 - time)
  }
  const noAttack = calculate(model, 0, { firstAttackStart: 3 })
  assert.deepEqual(noAttack.attacks, [])
  assert.equal(noAttack.totalDamage, 0)
  assert.equal(noAttack.firstHitTime, null)
  assert.equal(noAttack.lastHitTime, null)
})

test('未装備・全MOD段階・潜在・ブロック条件の既存ダメージと期間を再利用する', () => {
  for (const moduleId of ['', xId, yId]) {
    for (const level of moduleId ? [1, 2, 3] : [0]) {
      for (const potential of [1, 3, 4, 5, 6]) {
        for (const blocking of [false, true]) {
          const model = derive(moduleId, { potential, blocking }, level)
          const activeSettings = derive(moduleId, { potential, blocking, remnantActive: true }, level)
          assert.deepEqual(model, activeSettings)
          assert.equal(model.before.remnantActive, false)
          assert.equal(model.after.remnantActive, true)
          const duration = (potential >= 3 ? 9 : 8) + (moduleId === yId && level === 3 ? 1 : 0)
          assert.equal(model.timing.remnantDuration, duration)
          for (const resistance of [0, 20, 60, 100]) {
            const result = calculateSurtrTotalDamage(model, 25, resistance)!
            assert.ok(result)
            assert.equal(result.perHitBefore, calculateSurtrDpsCalculation(model.before, resistance)!.perHit)
            assert.equal(result.perHitRemnant, calculateSurtrDpsCalculation(model.after, resistance)!.perHit)
            assert.equal(result.damageBefore, result.perHitBefore * result.hitsBefore)
            assert.equal(result.damageRemnant, result.perHitRemnant * result.hitsRemnant)
            assert.equal(result.totalDamage, result.damageBefore + result.damageRemnant)
            assert.equal(result.attacks.length, result.totalHits)
            assert.ok(result.attacks.every(attack => attack.startTime < result.retreatTime && attack.hitTime < result.retreatTime))
          }
        }
      }
    }
  }
  assert.equal(derive(yId, {}, 1).timing.attackSpeedAfter, 100)
  assert.equal(derive(yId, {}, 2).timing.attackSpeedAfter, 120)
  assert.equal(derive(yId, {}, 3).timing.attackSpeedAfter, 130)
})

test('イベント一覧を省略したスイープも詳細計算と同じ回数・ダメージ・端点になる', () => {
  for (const model of [derive(), derive(xId), derive(yId)]) {
    for (const time of [0, 0.6, 10.7, 25, 3600]) {
      for (const ctCarry of ['time', 'ratio'] as const) {
        const assumptions = { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, ctCarry }
        const detailed = calculateSurtrTotalDamage(model, time, 60, assumptions)!
        const compact = calculateSurtrTotalDamage(model, time, 60, assumptions, { includeAttacks: false })!
        assert.deepEqual(compact, { ...detailed, attacks: [] })
      }
    }
  }
})

test('小数の境界誤差で同時の開始・命中・退場を二重計上しない', () => {
  const model = synthetic(0.1, 0.1, 0.2)
  const result = calculate(model, 0.1 + 0.2, { firstAttackStart: 0, hitDelay: 0.1, includeRetreatHit: true })
  assert.equal(result.hitsBefore, 2)
  assert.equal(result.hitsRemnant, 3)
  assert.equal(result.totalHits, 5)
  assert.equal(result.attacks.filter(attack => attack.hitTime === result.remnantActivationTime).length, 1)
  assert.equal(result.attacks.at(-1)!.hitTime, result.retreatTime)
})

test('不正な時間・術耐性・仮定・欠落データや上限を超える反復は未計算にする', () => {
  const model = derive()
  for (const time of [-1, NaN, Infinity, 3600.1]) assert.equal(calculateSurtrTotalDamage(model, time, 0), null)
  for (const resistance of [-1, 101, NaN, Infinity]) assert.equal(calculateSurtrTotalDamage(model, 25, resistance), null)
  for (const patch of [
    { firstAttackStart: -1 }, { firstAttackStart: NaN }, { firstAttackStart: Infinity }, { firstAttackStart: 3601 },
    { hitDelay: -1 }, { hitDelay: NaN }, { hitDelay: Infinity }, { hitDelay: 1.26 },
    { ctCarry: 'reset' as 'time' }, { includeRetreatHit: 1 as unknown as boolean },
  ]) assert.equal(calculateSurtrTotalDamage(model, 25, 0, { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, ...patch }), null)
  assert.equal(calculateSurtrTotalDamage(model, 25, 0, undefined, { includeAttacks: 1 as unknown as boolean }), null)
  assert.equal(calculateSurtrTotalDamage(synthetic(1e-10, 1e-10), 1, 0,
    { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS, hitDelay: 0 }), null)
  assert.equal(calculateSurtrTotalDamage({ ...model, timing: { ...model.timing, moduleId: 'other' } }, 25, 0), null)
  assert.equal(calculateSurtrTotalDamage({ ...model, timing: { ...model.timing, attackIntervalAfter: 0 } }, 25, 0), null)
  assert.equal(calculateSurtrTotalDamage({ ...model, timing: { ...model.timing, remnantDuration: 3601 } }, 25, 0), null)
  assert.equal(deriveSurtrTotalDamageModel(createRecord(), { ...settings, level: 59 }, xId), null)
  const record = createRecord()
  record.operatorProfile.talents = []
  assert.equal(deriveSurtrTotalDamageModel(record, settings), null)
})

test('時刻スイープは正確な等間隔で201点以下、刻みに乗らない末尾を追加しない', () => {
  assert.deepEqual(buildSurtrTotalDamageTimeSamples(10, 60, 10), [10, 20, 30, 40, 50, 60])
  assert.deepEqual(buildSurtrTotalDamageTimeSamples(0.1, 0.4, 0.1), [0.1, 0.2, 0.3, 0.4])
  assert.deepEqual(buildSurtrTotalDamageTimeSamples(10, 25, 10), [10, 20])
  assert.deepEqual(buildSurtrTotalDamageTimeSamples(25, 25, 1), [25])
  assert.equal(buildSurtrTotalDamageTimeSamples(0, 2, 0.01).length, 201)
  for (const values of [[0, 2.01, 0.01], [0, 100, 0.1], [-1, 5, 1], [1, 0, 1],
    [0, 3601, 1], [0, 1, 0], [0, 1, 0.001], [0, NaN, 1], [0, 1, Infinity]]) {
    assert.deepEqual(buildSurtrTotalDamageTimeSamples(values[0], values[1], values[2]), [])
  }
})

test('計算は入力モデル・仮定・元データを変更せず、結果の攻撃一覧を共有しない', () => {
  const model = derive(yId)
  const assumptions = { ...SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS }
  const modelBefore = structuredClone(model)
  const assumptionsBefore = { ...assumptions }
  const first = calculateSurtrTotalDamage(model, 25, 60, assumptions)!
  const second = calculateSurtrTotalDamage(model, 25, 60, assumptions)!
  first.attacks[0].damage = 999
  assert.notEqual(first.attacks[0].damage, second.attacks[0].damage)
  assert.deepEqual(model, modelBefore)
  assert.deepEqual(assumptions, assumptionsBefore)
})

// Compact fixture matching existing Surtr DPS/Remnant test source data.
function createRecord(): SkillRecord {
  const skillLevels = Array.from({ length: 10 }, () => ({
    name: 'ラグナロク', description: '攻撃力上昇、最大HP+5000、退場まで効果継続',
    duration: -1, durationType: 'NONE', skillType: 'MANUAL', blackboard: [
      { key: 'atk', value: 3.3 }, { key: 'max_hp', value: 5000 }, { key: 'interval', value: 0.2 },
      { key: 'hp_ratio', value: 0.2 }, { key: 'duration', value: 60 },
    ],
  }))
  return {
    id: 'char_350_surtr:skchr_surtr_3', operatorId: 'char_350_surtr', operatorName: 'スルト',
    profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'artsfghter', subProfessionName: '術戦士',
    nameInitial: 'S_ROW', rarity: 6, skillIndex: 3, skillId: 'skchr_surtr_3', skillName: 'ラグナロク',
    description: '', duration: -1, durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME',
    initSp: 0, spCost: 5, classification: classifySkill(skillLevels[9]), skillLevels, raw: skillLevels[9],
    operatorProfile: {
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { maxHp: 2216, atk: 544, attackSpeed: 100, baseAttackTime: 1.25 } },
        { level: 90, data: { maxHp: 2916, atk: 672, attackSpeed: 100, baseAttackTime: 1.25 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { maxHp: 0, atk: 0 } }, { level: 50, data: { maxHp: 0, atk: 100 } }],
      traitDescription: '敵に術ダメージを与える',
      potentialRanks: [{}, {}, { buff: { attributes: { attributeModifiers: [
        { attributeType: 'ATK', formulaItem: 'ADDITION', value: 28 },
      ] } } }, {}, {}],
      talents: [{ candidates: [0, 4].map(rank => ({ name: '劫火', requiredPotentialRank: rank,
        unlockCondition: { phase: 'PHASE_2', level: 1 },
        blackboard: [{ key: 'magic_resist_penetrate_fixed', value: rank ? 22 : 20 }],
      })) }, { candidates: [0, 2].map(rank => ({
        name: '余燼', requiredPotentialRank: rank, unlockCondition: { phase: 'PHASE_2', level: 1 },
        blackboard: [{ key: 'surtr_t_2[withdraw].interval', value: rank ? 9 : 8 }],
      })) }],
      modules: [module('X'), module('Y')],
    },
  }
}

function module(type: 'X' | 'Y'): RawOperatorModule {
  return {
    uniEquipId: type === 'X' ? xId : yId, uniEquipName: `MOD ${type}`, type: 'ADVANCED', typeName2: type,
    unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
    phases: [1, 2, 3].map((level, index) => ({
      equipLevel: level,
      attributeBlackboard: type === 'X' ? { atk: [30, 48, 60][index], magic_resistance: 5 }
        : { atk: [45, 55, 60][index], def: [42, 56, 65][index] },
      parts: [
        { overrideTraitDataBundle: { candidates: [{ requiredPotentialRank: 0,
          additionalDescription: type === 'X' ? '未ブロック時、攻撃速度+8' : 'ブロック中の敵に対術脆弱',
          blackboard: type === 'X' ? { attack_speed: 8 } : { damage_scale: 1.1 },
        }] } },
        { addOrOverrideTalentDataBundle: { candidates: type === 'X'
          ? (level === 1 ? [] : [0, 4].map(rank => ({ talentIndex: 0, name: '劫火', requiredPotentialRank: rank,
            blackboard: { magic_resist_penetrate_fixed: [20, 24, 26][index] + (rank ? 2 : 0) },
          })))
          : (level === 1 ? [] : [0, 2].map(rank => ({ talentIndex: 1, name: '余燼', requiredPotentialRank: rank,
            blackboard: { 'surtr_t_2[withdraw].interval': (level === 3 ? 9 : 8) + (rank ? 1 : 0),
              'surtr_t_2[withdraw].attack_speed': level === 3 ? 30 : 20 },
          }))),
        } },
      ],
    })),
  }
}

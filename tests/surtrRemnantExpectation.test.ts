import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import { deriveSurtrDpsModel, type SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import { calculateSurtrDpsCalculation } from '../src/lib/surtrDpsCalculation.ts'
import {
  calculateSurtrRemnantAttacks,
  deriveSurtrRemnantAttackModel,
  type SurtrRemnantAttackAssumptions,
  type SurtrRemnantAttackModel,
} from '../src/lib/surtrRemnantAttacks.ts'
import {
  buildSurtrRemnantExpectedDamagePoints,
  calculateSurtrRemnantAttackExpectation,
  calculateSurtrRemnantExpectedDamage,
} from '../src/lib/surtrRemnantExpectation.ts'
import type { RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

const assumptions: SurtrRemnantAttackAssumptions = { windup: 0.2, ctCarry: 'time', includeRetreatHit: false }
const defaults: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }

function models(type: 'X' | 'Y' | null = null, changes: Partial<SurtrDpsSettings> = {}) {
  const record = createRecord()
  const settings = { ...defaults, ...changes }
  const id = type === null ? '' : type === 'X' ? 'uniequip_002_surtr' : 'uniequip_003_surtr'
  const dps = deriveSurtrDpsModel(record, settings, id, 3)
  const attacks = deriveSurtrRemnantAttackModel(record, settings, id, 3)
  assert.ok(dps)
  assert.ok(attacks)
  return { dps, attacks }
}

function close(actual: number, expected: number, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)
}

test('潜在1の未装備・X3・Y3を全CT域で重み付けし、回数の分布を昇順で返す', () => {
  const expected = [
    { type: null, mean: 6.24, counts: [6, 7], probabilities: [0.76, 0.24] },
    { type: 'X', mean: 6.7392, counts: [6, 7], probabilities: [0.2608, 0.7392] },
    { type: 'Y', mean: 9.003076923076923, counts: [8, 9, 10], probabilities: [0.11384615384615385, 0.7692307692307693, 0.11692307692307692] },
  ] as const
  for (const entry of expected) {
    const { attacks } = models(entry.type)
    const result = calculateSurtrRemnantAttackExpectation(attacks, assumptions)!
    assert.ok(result)
    close(result.expectedHitCount, entry.mean)
    assert.equal(result.remainingCtLimit, attacks.attackIntervalBefore)
    assert.deepEqual(result.probabilities.map(value => value.hitCount), entry.counts)
    close(result.probabilities.reduce((sum, value) => sum + value.probability, 0), 1)
    assert.equal(result.expectedHitCount, result.probabilities.reduce((sum, value) => sum + value.contribution, 0))
    for (const [index, value] of result.probabilities.entries()) {
      close(value.probability, entry.probabilities[index])
      assert.equal(value.contribution, value.hitCount * value.probability)
      close(value.probability, value.ctRanges.reduce((sum, range) => sum + (range.to - range.from) / attacks.attackIntervalBefore, 0))
      assert.ok(value.ctRanges.every(range => range.count === value.hitCount && range.to > range.from))
    }
    const orderedRanges = result.probabilities.flatMap(value => value.ctRanges).sort((first, second) => first.from - second.from)
    assert.equal(orderedRanges[0].from, 0)
    assert.equal(orderedRanges.at(-1)!.to, attacks.attackIntervalBefore)
    assert.ok(orderedRanges.slice(1).every((range, index) => range.from === orderedRanges[index].to))
  }
})

test('X固有の1.157407…秒までを含め、テーブル刻み・他MODの1.25秒で制限しない', () => {
  const { attacks } = models('X')
  const result = calculateSurtrRemnantAttackExpectation(attacks, assumptions)!
  assert.equal(result.remainingCtLimit, 1.25 / 1.08)
  assert.ok(result.remainingCtLimit > 1.15 && result.remainingCtLimit < 1.2)
  const sixHits = result.probabilities.find(entry => entry.hitCount === 6)!
  assert.equal(sixHits.ctRanges.at(-1)!.to, attacks.attackIntervalBefore)
  close(sixHits.probability, (attacks.attackIntervalBefore - (8 - 0.2 - 6 * attacks.attackIntervalAfter)) / attacks.attackIntervalBefore)
  close(result.expectedHitCount, 6.7392)
})

test('潜在1・3の両ブロック状態を独立導出し、初期のブロック選択に依存しない', () => {
  const record = createRecord()
  const modules = [
    { id: '', type: null },
    { id: 'uniequip_002_surtr', type: 'X' },
    { id: 'uniequip_003_surtr', type: 'Y' },
  ] as const
  const expectedMeans = [
    { potential: 1, nonBlocking: [6.24, 6.7392, 9.003076923076923], blocking: [6.24, 6.24, 9.003076923076923] },
    { potential: 3, nonBlocking: [7.04, 7.6032, 10.064615384615385], blocking: [7.04, 7.04, 10.064615384615385] },
  ]
  for (const entry of expectedMeans) {
    const comparisons = [false, true].map(initialBlocking => {
      const settings = { ...defaults, potential: entry.potential, blocking: initialBlocking }
      const before = structuredClone({ record, settings })
      const states = [false, true].map(blocking => modules.map(({ id, type }, index) => {
        const attacks = deriveSurtrRemnantAttackModel(record, { ...settings, blocking }, id, 3)
        assert.ok(attacks)
        assert.equal(attacks.moduleType, type)
        const intervalBefore = type === 'X' && !blocking ? 1.25 / 1.08 : 1.25
        const intervalAfter = type === 'Y' ? 1.25 / 1.3 : intervalBefore
        const duration = (entry.potential === 3 ? 9 : 8) + (type === 'Y' ? 1 : 0)
        close(attacks.attackIntervalBefore, intervalBefore)
        close(attacks.attackIntervalAfter, intervalAfter)
        assert.equal(attacks.remnantDuration, duration)
        const result = calculateSurtrRemnantAttackExpectation(attacks, assumptions)
        assert.ok(result)
        close(result.expectedHitCount, (blocking ? entry.blocking : entry.nonBlocking)[index])
        assert.equal(result.remainingCtLimit, attacks.attackIntervalBefore)
        close(result.probabilities.reduce((sum, value) => sum + value.probability, 0), 1)
        return { attacks, result }
      }))
      assert.deepEqual({ record, settings }, before)
      return states
    })
    assert.deepEqual(comparisons[0], comparisons[1])
  }
})

test('両ブロック状態で命中準備時間・CT引継ぎを変更しても、各MOD自身の発動前CT域を平均する', () => {
  // Independent analytical means for a 0.45 s windup. With time carry, Y's
  // 1.25 s initial CT window spans more than one 25/26 s attack period; ratio
  // carry instead maps that entire window to one post-activation period.
  const expected = [
    { potential: 1, time: [6.04, 6.5232, 8.686153846153846], ratio: [6.04, 6.5232, 8.892] },
    { potential: 3, time: [6.84, 7.3872, 9.716923076923077], ratio: [6.84, 7.3872, 9.932] },
  ]
  for (const entry of expected) {
    for (const blocking of [false, true]) {
      for (const ctCarry of ['time', 'ratio'] as const) {
        const selected = { ...assumptions, windup: 0.45, ctCarry }
        for (const [index, type] of ([null, 'X', 'Y'] as const).entries()) {
          const { attacks } = models(type, { potential: entry.potential, blocking })
          const result = calculateSurtrRemnantAttackExpectation(attacks, selected)
          assert.ok(result)
          close(result.expectedHitCount, type === 'X' && blocking ? entry[ctCarry][0] : entry[ctCarry][index])
          assert.equal(result.remainingCtLimit, attacks.attackIntervalBefore)
          const ranges = result.probabilities.flatMap(value => value.ctRanges).sort((first, second) => first.from - second.from)
          assert.equal(ranges[0].from, 0)
          assert.equal(ranges.at(-1)!.to, attacks.attackIntervalBefore)
          assert.ok(ranges.slice(1).every((range, rangeIndex) => range.from === ranges[rangeIndex].to))
          for (const value of result.probabilities) {
            const width = value.ctRanges.reduce((sum, range) => sum + range.to - range.from, 0)
            close(value.probability, width / attacks.attackIntervalBefore)
          }
          close(result.probabilities.reduce((sum, value) => sum + value.probability, 0), 1)
        }
      }
    }
  }
})

test('平均CTでの1回計算ではなく、全CTの階段状の命中回数を平均する', () => {
  const { attacks } = models()
  const result = calculateSurtrRemnantAttackExpectation(attacks, assumptions)!
  assert.equal(calculateSurtrRemnantAttacks(attacks, attacks.attackIntervalBefore / 2, assumptions)!.hitCount, 6)
  close(result.expectedHitCount, 6.24)
})

test('割合引継ぎは命中準備時間を変えず、Yの期待回数と分布を変える', () => {
  const selected = { ...assumptions, ctCarry: 'ratio' as const }
  for (const type of [null, 'X'] as const) {
    const { attacks } = models(type)
    close(calculateSurtrRemnantAttackExpectation(attacks, selected)!.expectedHitCount,
      calculateSurtrRemnantAttackExpectation(attacks, assumptions)!.expectedHitCount)
  }
  const { attacks } = models('Y')
  const result = calculateSurtrRemnantAttackExpectation(attacks, selected)!
  close(result.expectedHitCount, (attacks.remnantDuration - assumptions.windup) / attacks.attackIntervalAfter)
  close(result.expectedHitCount, 9.152)
  assert.deepEqual(result.probabilities.map(entry => entry.hitCount), [9, 10])
  close(result.probabilities[0].probability, 0.848)
  close(result.probabilities[1].probability, 0.152)
  close(result.probabilities[1].ctRanges[0].to, 0.19)
})

test('CTゼロ・上限だけにある孤立した回数は確率0で、端点包含は期待値を変えない', () => {
  const { attacks } = models()
  const integerWindow = { ...attacks, attackIntervalBefore: 1, attackIntervalAfter: 1, remnantDuration: 2 }
  for (const includeRetreatHit of [false, true]) {
    const selected = { ...assumptions, windup: 0, includeRetreatHit }
    const result = calculateSurtrRemnantAttackExpectation(integerWindow, selected)!
    assert.equal(calculateSurtrRemnantAttacks(integerWindow, 0, selected)!.hitCount, includeRetreatHit ? 3 : 2)
    assert.equal(calculateSurtrRemnantAttacks(integerWindow, 1, selected)!.hitCount, includeRetreatHit ? 2 : 1)
    assert.equal(result.expectedHitCount, 2)
    assert.deepEqual(result.probabilities.map(({ hitCount, probability }) => ({ hitCount, probability })), [{ hitCount: 2, probability: 1 }])
  }
  close(calculateSurtrRemnantAttackExpectation(attacks, { ...assumptions, includeRetreatHit: true })!.expectedHitCount, 6.24)
})

test('短い余燼の有効な0回をnullにせず、0回と1回の混在も平均する', () => {
  const { dps, attacks } = models()
  const zero = { ...attacks, remnantDuration: 0.1 }
  const result = calculateSurtrRemnantAttackExpectation(zero, assumptions)!
  assert.equal(result.expectedHitCount, 0)
  assert.deepEqual(result.probabilities.map(({ hitCount, probability, contribution }) => ({ hitCount, probability, contribution })),
    [{ hitCount: 0, probability: 1, contribution: 0 }])
  const damage = calculateSurtrRemnantExpectedDamage(dps, zero, 60, assumptions)!
  assert.equal(damage.totalDamage, 0)
  assert.equal(damage.expectedHitCount, 0)
  close(damage.perHit, 1991.4)
  const partial = calculateSurtrRemnantAttackExpectation({ ...attacks, remnantDuration: 0.5 }, assumptions)!
  assert.deepEqual(partial.probabilities.map(entry => entry.hitCount), [0, 1])
  close(partial.expectedHitCount, 0.24)
  close(partial.probabilities[0].probability, 0.76)
})

test('既存の1撃ダメージを期待回数に掛け、精度とMODの術耐性無視を保持する', () => {
  const expected = [
    { type: null, perHit: 1991.4, total: 12426.336 },
    { type: 'X', perHit: 2360.82, total: 15910.038144 },
    { type: 'Y', perHit: 2146.2, total: 19322.403692307693 },
  ] as const
  for (const entry of expected) {
    const { dps, attacks } = models(entry.type)
    const result = calculateSurtrRemnantExpectedDamage(dps, attacks, 60, assumptions)!
    assert.ok(result)
    close(result.perHit, entry.perHit)
    close(result.totalDamage, entry.total, 1e-8)
    assert.equal(result.perHit, calculateSurtrDpsCalculation(dps, 60)!.perHit)
    assert.equal(result.totalDamage, result.perHit * result.expectedHitCount)
  }
  const { dps, attacks } = models('X')
  const fractional = calculateSurtrRemnantExpectedDamage(dps, attacks, 37.5, assumptions)!
  close(fractional.perHit, 3165.645)
  close(fractional.totalDamage, 3165.645 * 6.7392, 1e-8)
  assert.notEqual(fractional.totalDamage, Math.round(fractional.totalDamage))
})

test('ブロック中のY脆弱、X攻速の変化と潜在の余燼時間・ATKを共有条件から反映する', () => {
  for (const type of ['X', 'Y'] as const) {
    const results = [false, true].map(blocking => {
      const { dps, attacks } = models(type, { blocking })
      return calculateSurtrRemnantExpectedDamage(dps, attacks, 60, assumptions)!
    })
    if (type === 'X') {
      assert.equal(results[0].perHit, results[1].perHit)
      close(results[0].expectedHitCount, 6.7392)
      close(results[1].expectedHitCount, 6.24)
    } else {
      assert.equal(results[0].expectedHitCount, results[1].expectedHitCount)
      close(results[1].perHit / results[0].perHit, 1.1)
    }
  }
  const values = [1, 3, 4, 5].map(potential => {
    const { dps, attacks } = models(null, { potential })
    return calculateSurtrRemnantExpectedDamage(dps, attacks, 60, assumptions)!
  })
  close(values[1].expectedHitCount, 7.04)
  assert.equal(values[0].perHit, values[1].perHit)
  assert.ok(values[2].perHit > values[1].perHit)
  assert.ok(values[3].perHit > values[2].perHit)
})

test('術耐性点の順序と重複を保ち、無効点を省かずnull・有効0点を0にする', () => {
  const { dps, attacks } = models('X')
  const resistances = [60, 0, 101, NaN, 60]
  const points = buildSurtrRemnantExpectedDamagePoints(dps, attacks, resistances, assumptions)
  assert.deepEqual(points.map(point => point.x), resistances)
  close(points[0].value!, 15910.038144, 1e-8)
  close(points[1].value!, 24106.1184, 1e-8)
  assert.deepEqual(points[0], points[4])
  for (const point of points.slice(2, 4)) assert.deepEqual(point, { x: point.x, value: null, expectedHitCount: null, perHit: null })
  const zero = buildSurtrRemnantExpectedDamagePoints(dps, { ...attacks, remnantDuration: 0.1 }, [60, 101], assumptions)
  assert.equal(zero[0].value, 0)
  assert.equal(zero[0].expectedHitCount, 0)
  assert.ok(zero[0].perHit! > 0)
  assert.equal(zero[1].value, null)
  assert.deepEqual(buildSurtrRemnantExpectedDamagePoints(dps, attacks, [], assumptions), [])
})

test('モデル不一致・不正な術耐性・ダメージオーバーフローを既存計算と同様に拒否する', () => {
  const { dps, attacks } = models('Y')
  for (const patch of [
    { moduleId: 'uniequip_002_surtr' }, { moduleType: 'X' as const }, { moduleLevel: 2 },
    { attackIntervalBefore: attacks.attackIntervalBefore + 0.01 }, { attackSpeedBefore: 108 },
  ]) assert.equal(calculateSurtrRemnantExpectedDamage(dps, { ...attacks, ...patch }, 60, assumptions), null)
  for (const resistance of [-1, 101, NaN, Infinity]) assert.equal(calculateSurtrRemnantExpectedDamage(dps, attacks, resistance, assumptions), null)
  for (const effectiveAttack of [0, -1, NaN, Infinity, 1e308]) {
    assert.equal(calculateSurtrRemnantExpectedDamage({ ...dps, effectiveAttack }, attacks, 0, assumptions), null)
  }
  const points = buildSurtrRemnantExpectedDamagePoints(dps, models('X').attacks, [0, 60], assumptions)
  assert.ok(points.every(point => point.value === null && point.expectedHitCount === null && point.perHit === null))
})

test('不正なモデル・仮定と回数上限超過は0回にせずnullにする', () => {
  const { dps, attacks } = models('Y')
  const check = (model: SurtrRemnantAttackModel, selected = assumptions) => {
    assert.equal(calculateSurtrRemnantAttackExpectation(model, selected), null)
    assert.equal(calculateSurtrRemnantExpectedDamage(dps, model, 60, selected), null)
    assert.deepEqual(buildSurtrRemnantExpectedDamagePoints(dps, model, [60], selected),
      [{ x: 60, value: null, expectedHitCount: null, perHit: null }])
  }
  for (const key of ['attackIntervalBefore', 'attackIntervalAfter', 'remnantDuration', 'attackSpeedBefore', 'attackSpeedAfter']) {
    for (const value of [0, -1, NaN, Infinity]) check({ ...attacks, [key]: value })
  }
  for (const windup of [-1, NaN, Infinity, 1]) check(attacks, { ...assumptions, windup })
  check(attacks, { ...assumptions, ctCarry: 'reset' as 'time' })
  check(attacks, { ...assumptions, includeRetreatHit: 1 as unknown as boolean })
  check({ ...attacks, attackIntervalAfter: 1e-10 }, { ...assumptions, windup: 0 })
})

test('巨大な有効CT域でも幅を先に正規化し、有限の期待回数を保つ', () => {
  const { attacks } = models()
  const huge = { ...attacks, attackIntervalBefore: 1e308, attackIntervalAfter: 5e307, remnantDuration: 1.7e308 }
  const result = calculateSurtrRemnantAttackExpectation(huge, { ...assumptions, windup: 0 })!
  assert.ok(result)
  close(result.expectedHitCount, 2.9)
  close(result.probabilities.reduce((sum, entry) => sum + entry.probability, 0), 1)
  assert.equal(result.remainingCtLimit, 1e308)
})

test('入力モデル・仮定・術耐性配列を変更しない', () => {
  const { dps, attacks } = models('Y')
  const resistances = [0, 37.5, 60, 101]
  const before = structuredClone({ dps, attacks, assumptions, resistances })
  calculateSurtrRemnantAttackExpectation(attacks, assumptions)
  calculateSurtrRemnantExpectedDamage(dps, attacks, 37.5, assumptions)
  buildSurtrRemnantExpectedDamagePoints(dps, attacks, resistances, assumptions)
  assert.deepEqual({ dps, attacks, assumptions, resistances }, before)
})

// Reuse the compact JP S3/module fixture values from surtrRemnantDamage.test.ts.
function createRecord(): SkillRecord {
  const skillLevels = Array.from({ length: 10 }, () => ({
    name: 'ラグナロク', description: '攻撃力上昇、最大HP+5000、退場まで継続',
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
      talents: [
        { candidates: [0, 4].map(rank => ({ name: '劫火', requiredPotentialRank: rank,
          unlockCondition: { phase: 'PHASE_2', level: 1 },
          blackboard: [{ key: 'magic_resist_penetrate_fixed', value: rank ? 22 : 20 }],
        })) },
        { candidates: [0, 2].map(rank => ({ name: '余燼', requiredPotentialRank: rank,
          unlockCondition: { phase: 'PHASE_2', level: 1 },
          blackboard: [{ key: 'surtr_t_2[withdraw].interval', value: rank ? 9 : 8 }],
        })) },
      ],
      modules: [module('X'), module('Y')],
    },
  }
}

function module(type: 'X' | 'Y'): RawOperatorModule {
  return {
    uniEquipId: type === 'X' ? 'uniequip_002_surtr' : 'uniequip_003_surtr',
    uniEquipName: `MOD ${type}`, type: 'ADVANCED', typeName2: type,
    unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
    phases: [{ equipLevel: 3, attributeBlackboard: { atk: 60 }, parts: [
      { overrideTraitDataBundle: { candidates: [{ requiredPotentialRank: 0,
        additionalDescription: type === 'X' ? '非ブロック時に攻速+8' : 'ブロック対象に対術脆弱10%',
        blackboard: type === 'X' ? { attack_speed: 8 } : { damage_scale: 1.1 },
      }] } },
      { addOrOverrideTalentDataBundle: { candidates: type === 'X'
        ? [0, 4].map(rank => ({ talentIndex: 0, requiredPotentialRank: rank, name: '劫火',
          blackboard: { magic_resist_penetrate_fixed: rank ? 28 : 26 },
        }))
        : [0, 2].map(rank => ({ talentIndex: 1, requiredPotentialRank: rank, name: '余燼',
          blackboard: { 'surtr_t_2[withdraw].interval': rank ? 10 : 9, 'surtr_t_2[withdraw].attack_speed': 30 },
        })),
      } },
    ] }],
  }
}

import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import { deriveSurtrDpsModel, type SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import { calculateSurtrDpsCalculation } from '../src/lib/surtrDpsCalculation.ts'
import {
  deriveSurtrRemnantAttackModel,
  type SurtrRemnantAttackAssumptions,
} from '../src/lib/surtrRemnantAttacks.ts'
import { buildSurtrRemnantDamagePoints, calculateSurtrRemnantDamage } from '../src/lib/surtrRemnantDamage.ts'
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

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
}

test('各MODのS3の1発ダメージと余燼中の整数命中回数を掛け合わせる', () => {
  const expected = [
    { type: null, perHit: 1991.4, hitCount: 6, totalDamage: 11948.4 },
    { type: 'X', perHit: 2360.82, hitCount: 7, totalDamage: 16525.74 },
    { type: 'Y', perHit: 2146.2, hitCount: 9, totalDamage: 19315.8 },
  ] as const
  for (const entry of expected) {
    const { dps, attacks } = models(entry.type)
    const result = calculateSurtrRemnantDamage(dps, attacks, 0.5, 60, assumptions)!
    assert.ok(result)
    close(result.perHit, entry.perHit)
    assert.equal(result.hitCount, entry.hitCount)
    close(result.totalDamage, entry.totalDamage)
    assert.equal(result.totalDamage, result.perHit * result.hitCount)
    assert.equal(result.perHit, calculateSurtrDpsCalculation(dps, 60)!.perHit)
  }
})

test('Yはブロック対象の対術脆弱を1発に反映し、Xはブロックによる回数の違いを反映する', () => {
  const results = (['X', 'Y'] as const).map(type => [false, true].map(blocking => {
    const { dps, attacks } = models(type, { blocking })
    return calculateSurtrRemnantDamage(dps, attacks, 0.5, 60, assumptions)!
  }))
  assert.equal(results[0][0].perHit, results[0][1].perHit)
  assert.deepEqual(results[0].map(result => result.hitCount), [7, 6])
  assert.deepEqual(results[1].map(result => result.hitCount), [9, 9])
  close(results[1][1].perHit / results[1][0].perHit, 1.1)
  close(results[1][1].totalDamage, 21247.38)
})

test('潜在3の余燼時間、潜在4のATK、潜在5の術耐性無視を別々に反映する', () => {
  const values = [1, 3, 4, 5].map(potential => {
    const { dps, attacks } = models('X', { potential })
    return calculateSurtrRemnantDamage(dps, attacks, 0.5, 50, assumptions)!
  })
  assert.deepEqual(values.map(result => result.hitCount), [7, 8, 8, 8])
  assert.equal(values[0].perHit, values[1].perHit)
  close(values[0].perHit, 2718.52)
  close(values[2].perHit, 2810.48)
  close(values[3].perHit, 2884.44)
  close(values[3].totalDamage, 23075.52)
})

test('1発と総ダメージの小数を新たに丸めず、入力モデルを変更しない', () => {
  const { dps, attacks } = models('X')
  const before = structuredClone({ dps, attacks, assumptions })
  const result = calculateSurtrRemnantDamage(dps, attacks, 0.5, 37.5, assumptions)!
  assert.equal(dps.effectiveAttack, 3577)
  close(result.perHit, 3165.645)
  close(result.totalDamage, 22159.515)
  assert.equal(result.totalDamage, result.perHit * 7)
  assert.deepEqual({ dps, attacks, assumptions }, before)
})

test('有効な0回は0ダメージ、Xの有効範囲外はnullのまま扱う', () => {
  const { dps, attacks } = models('X')
  const short = { ...attacks, remnantDuration: 0.1 }
  const zero = calculateSurtrRemnantDamage(dps, short, 0.5, 60, assumptions)!
  assert.equal(zero.totalDamage, 0)
  assert.equal(zero.hitCount, 0)
  close(zero.perHit, 2360.82)
  assert.equal(calculateSurtrRemnantDamage(dps, attacks, 1.2, 60, assumptions), null)
  const points = buildSurtrRemnantDamagePoints(dps, short, [0.5, 1.2], [60], assumptions)
  assert.equal(points[0].value, 0)
  assert.equal(points[0].hitCount, 0)
  assert.deepEqual(points[1], { remainingCt: 1.2, enemyResistance: 60, value: null, hitCount: null, perHit: null })
})

test('退場と同時の命中と1nsの同時判定を既存の回数計算に委ねる', () => {
  const { dps, attacks } = models()
  for (const offset of [-5e-10, 0, 5e-10]) {
    for (const includeRetreatHit of [false, true]) {
      const result = calculateSurtrRemnantDamage(dps, attacks, 0.3 + offset, 60, { ...assumptions, includeRetreatHit })!
      assert.equal(result.hitCount, includeRetreatHit ? 7 : 6)
      close(result.totalDamage, 1991.4 * result.hitCount)
    }
  }
  assert.equal(calculateSurtrRemnantDamage(dps, attacks, 0.3 - 2e-9, 60, assumptions)!.hitCount, 7)
  assert.equal(calculateSurtrRemnantDamage(dps, attacks, 0.3 + 2e-9, 60,
    { ...assumptions, includeRetreatHit: true })!.hitCount, 6)
})

test('Yの割合引継ぎは命中回数だけを変え、1発ダメージは変えない', () => {
  const { dps, attacks } = models('Y')
  const time = calculateSurtrRemnantDamage(dps, attacks, 0.18, 60, assumptions)!
  const ratio = calculateSurtrRemnantDamage(dps, attacks, 0.18, 60, { ...assumptions, ctCarry: 'ratio' })!
  assert.deepEqual([time.hitCount, ratio.hitCount], [9, 10])
  assert.equal(time.perHit, ratio.perHit)
  close(ratio.totalDamage - time.totalDamage, ratio.perHit)
})

test('CT順・術耐性順の全組合せを保ち、範囲外の点を消さずnullにする', () => {
  const { dps, attacks } = models('X')
  const cts = [1.2, 0.5, 0.5]
  const resistances = [60, 0, 101]
  const points = buildSurtrRemnantDamagePoints(dps, attacks, cts, resistances, assumptions)
  assert.equal(points.length, 9)
  assert.deepEqual(points.map(({ remainingCt, enemyResistance }) => [remainingCt, enemyResistance]),
    cts.flatMap(ct => resistances.map(resistance => [ct, resistance])))
  assert.ok(points.slice(0, 3).every(point => point.value === null))
  assert.equal(points[3].hitCount, 7)
  close(points[3].value!, 16525.74)
  close(points[4].value!, 25039)
  assert.equal(points[5].value, null)
  assert.deepEqual(points.slice(3, 6), points.slice(6, 9))
  assert.deepEqual(buildSurtrRemnantDamagePoints(dps, attacks, [], resistances, assumptions), [])
  assert.deepEqual(buildSurtrRemnantDamagePoints(dps, attacks, cts, [], assumptions), [])
  assert.deepEqual(cts, [1.2, 0.5, 0.5])
  assert.deepEqual(resistances, [60, 0, 101])
})

test('装備の識別子・種類・段階と発動前の攻撃条件が一致しないモデルを拒否する', () => {
  const { dps, attacks } = models('Y')
  for (const patch of [
    { moduleId: 'uniequip_002_surtr' }, { moduleType: 'X' as const }, { moduleLevel: 2 },
    { attackIntervalBefore: attacks.attackIntervalBefore + 0.01 }, { attackSpeedBefore: 108 },
  ]) assert.equal(calculateSurtrRemnantDamage(dps, { ...attacks, ...patch }, 0.5, 60, assumptions), null)
  assert.equal(calculateSurtrRemnantDamage({ ...dps, attackInterval: attacks.attackIntervalAfter }, attacks, 0.5, 60, assumptions), null)
  const closeTiming = { ...attacks, attackIntervalBefore: attacks.attackIntervalBefore + Number.EPSILON }
  assert.ok(calculateSurtrRemnantDamage(dps, closeTiming, 0.5, 60, assumptions))
  const wrongPoints = buildSurtrRemnantDamagePoints(dps, models('X').attacks, [0, 0.5], [0, 60], assumptions)
  assert.ok(wrongPoints.every(point => point.value === null && point.hitCount === null && point.perHit === null))
})

test('不正な入力・モデル・積のオーバーフローを0ダメージに置き換えない', () => {
  const { dps, attacks } = models()
  for (const ct of [-1, NaN, Infinity, 1.26]) assert.equal(calculateSurtrRemnantDamage(dps, attacks, ct, 60, assumptions), null)
  for (const resistance of [-1, 101, NaN, Infinity]) assert.equal(calculateSurtrRemnantDamage(dps, attacks, 0.5, resistance, assumptions), null)
  for (const windup of [-1, NaN, Infinity, 1.26]) assert.equal(calculateSurtrRemnantDamage(dps, attacks, 0.5, 60, { ...assumptions, windup }), null)
  for (const effectiveAttack of [0, -1, NaN, Infinity]) assert.equal(calculateSurtrRemnantDamage({ ...dps, effectiveAttack }, attacks, 0.5, 60, assumptions), null)
  assert.equal(calculateSurtrRemnantDamage(dps, { ...attacks, remnantDuration: 0 }, 0.5, 60, assumptions), null)
  assert.equal(calculateSurtrRemnantDamage({ ...dps, effectiveAttack: 1e308 }, attacks, 0.5, 0, assumptions), null)
})

// Compact JP S3/module data with the same values as the existing Surtr model fixtures.
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

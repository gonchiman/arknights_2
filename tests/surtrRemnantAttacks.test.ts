import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import {
  buildSurtrRemnantCtSamples,
  calculateSurtrRemnantAttacks,
  deriveSurtrRemnantAttackModel,
  getSurtrRemnantCtLimit,
  getSurtrRemnantWindupLimit,
  type SurtrRemnantAttackAssumptions,
  type SurtrRemnantCtStep,
} from '../src/lib/surtrRemnantAttacks.ts'
import type { SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import type { RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

const settings: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }
const assumptions: SurtrRemnantAttackAssumptions = { windup: 0.2, ctCarry: 'time', includeRetreatHit: false }
const xId = 'uniequip_002_surtr'
const yId = 'uniequip_003_surtr'

function derive(moduleId = '', changes: Partial<SurtrDpsSettings> = {}, moduleLevel = 3) {
  const model = deriveSurtrRemnantAttackModel(createRecord(), { ...settings, ...changes }, moduleId, moduleLevel)
  assert.ok(model)
  return model
}

function calculate(model = derive(), remainingCt = 0.3, changes: Partial<SurtrRemnantAttackAssumptions> = {}) {
  const result = calculateSurtrRemnantAttacks(model, remainingCt, { ...assumptions, ...changes })
  assert.ok(result)
  return result
}

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
}

test('未装備とXは余燼中も攻速を維持し、Xの未ブロック条件を反映する', () => {
  const none = derive()
  assert.deepEqual([none.attackSpeedBefore, none.attackSpeedAfter, none.attackIntervalBefore, none.attackIntervalAfter,
    none.remnantDuration, none.moduleLevel], [100, 100, 1.25, 1.25, 8, 0])
  const free = derive(xId)
  assert.deepEqual([free.attackSpeedBefore, free.attackSpeedAfter, free.remnantDuration], [108, 108, 8])
  close(free.attackIntervalBefore, 1.25 / 1.08)
  close(free.attackIntervalAfter, free.attackIntervalBefore)
  const blocked = derive(xId, { blocking: true })
  assert.deepEqual([blocked.attackSpeedBefore, blocked.attackSpeedAfter, blocked.attackIntervalAfter], [100, 100, 1.25])
})

test('Yの段階別攻速と余燼時間、潜在3の延長を候補データから取得する', () => {
  const models = [1, 2, 3].map(level => derive(yId, {}, level))
  assert.deepEqual(models.map(model => [model.attackSpeedBefore, model.attackSpeedAfter, model.remnantDuration]),
    [[100, 100, 8], [100, 120, 8], [100, 130, 9]])
  close(models[1].attackIntervalAfter, 1.25 / 1.2)
  close(models[2].attackIntervalAfter, 1.25 / 1.3)
  assert.deepEqual([1, 2, 3].map(level => derive(yId, { potential: 3 }, level).remnantDuration), [9, 9, 10])
  assert.equal(derive('', { potential: 3 }).remnantDuration, 9)
  assert.equal(derive(yId, { blocking: true }).attackIntervalAfter, models[2].attackIntervalAfter)
})

test('S3の余燼ON設定を受けても発動前CTを維持し、Yの攻速を二重加算しない', () => {
  for (const moduleId of ['', xId, yId]) {
    for (const level of moduleId ? [1, 2, 3] : [0]) {
      for (const blocking of [false, true]) {
        const baseline = derive(moduleId, { blocking }, level)
        const active = derive(moduleId, { blocking, remnantActive: true }, level)
        assert.deepEqual(active, baseline)
        assert.deepEqual(calculate(active), calculate(baseline))
      }
    }
  }
  assert.equal(derive(yId, { remnantActive: true }).attackSpeedBefore, 100)
  assert.equal(derive(yId, { remnantActive: true }).attackSpeedAfter, 130)
})

test('攻速・期間・基礎攻撃間隔の変更を反映し、定数で代用しない', () => {
  const record = createRecord()
  for (const frame of record.operatorProfile.phases[2].attributesKeyFrames!) frame.data!.baseAttackTime = 1.6
  const blackboard = yBlackboard(record)
  blackboard['surtr_t_2[withdraw].attack_speed'] = 43
  blackboard['surtr_t_2[withdraw].interval'] = 11
  const model = deriveSurtrRemnantAttackModel(record, settings, yId)!
  assert.ok(model)
  assert.equal(model.attackSpeedAfter, 143)
  assert.equal(model.remnantDuration, 11)
  assert.equal(model.attackIntervalBefore, 1.6)
  close(model.attackIntervalAfter, 1.6 / 1.43)
})

test('無効な構成と欠落・不正な余燼攻速は推測せずnullにする', () => {
  for (const value of [-1, NaN, Infinity]) {
    const record = createRecord()
    yBlackboard(record)['surtr_t_2[withdraw].attack_speed'] = value
    assert.equal(deriveSurtrRemnantAttackModel(record, settings, yId), null)
  }
  const missing = createRecord()
  delete yBlackboard(missing)['surtr_t_2[withdraw].attack_speed']
  assert.equal(deriveSurtrRemnantAttackModel(missing, settings, yId), null)
  assert.equal(deriveSurtrRemnantAttackModel(createRecord(), settings, 'missing'), null)
  assert.equal(deriveSurtrRemnantAttackModel(createRecord(), { ...settings, level: 59 }, yId), null)
  assert.equal(deriveSurtrRemnantAttackModel(createRecord(), { ...settings, potential: 7 }), null)
  assert.equal(deriveSurtrRemnantAttackModel({ ...createRecord(), skillIndex: 2 }, settings), null)
})

test('残りCTと命中までの時間を分け、期間内の命中だけを数える', () => {
  const result = calculate()
  assert.equal(result.remainingCtBefore, 0.3)
  assert.equal(result.remainingCtAfter, 0.3)
  assert.deepEqual(result.hitTimes, [0.5, 1.75, 3, 4.25, 5.5, 6.75])
  assert.equal(result.firstHitTime, 0.5)
  assert.equal(result.lastHitTime, 6.75)
  assert.equal(result.hitCount, 6)
  // The seventh impact is exactly at retreat, so the selected endpoint rule decides it.
  assert.equal(calculate(derive(), 0.3, { includeRetreatHit: true }).hitCount, 7)
  assert.equal(calculate(derive(), 0.29).hitCount, 7)
  assert.equal(calculate(derive(), 0.31).hitCount, 6)
})

test('割合維持は残りCTだけを変換し、発動後の命中準備時間は変えない', () => {
  const y = derive(yId)
  const fixed = calculate(y, 1)
  const ratio = calculate(y, 1, { ctCarry: 'ratio' })
  close(fixed.remainingCtAfter, 1)
  close(ratio.remainingCtAfter, 1 / 1.3)
  close(ratio.firstHitTime!, 1 / 1.3 + 0.2)
  assert.equal(fixed.hitCount, 9)
  assert.equal(ratio.hitCount, 9)
  assert.equal(calculate(y, 0.18).hitCount, 9)
  assert.equal(calculate(y, 0.18, { ctCarry: 'ratio' }).hitCount, 10)
  for (let index = 1; index < ratio.hitCount; index += 1) {
    close(ratio.hitTimes[index] - ratio.hitTimes[index - 1], y.attackIntervalAfter)
  }
  assert.deepEqual(calculate(derive(xId), 0.3), calculate(derive(xId), 0.3, { ctCarry: 'ratio' }))
  assert.equal(calculate(y, 0, { windup: 0 }).firstHitTime, 0)
})

test('退場の1ns以内を同時刻と扱い、その外側では通常の前後判定を使う', () => {
  for (const offset of [-5e-10, 0, 5e-10]) {
    const ct = 0.3 + offset
    const excluded = calculate(derive(), ct)
    const included = calculate(derive(), ct, { includeRetreatHit: true })
    assert.equal(excluded.hitCount, 6)
    assert.equal(included.hitCount, 7)
    assert.equal(included.lastHitTime, 8)
  }
  assert.equal(calculate(derive(), 0.3 - 2e-9).hitCount, 7)
  assert.equal(calculate(derive(), 0.3 + 2e-9, { includeRetreatHit: true }).hitCount, 6)
})

test('最初の命中が退場後なら0回とnull時刻を返す', () => {
  const short = { ...derive(), remnantDuration: 0.1 }
  assert.deepEqual(calculate(short), {
    remainingCtBefore: 0.3, remainingCtAfter: 0.3, firstHitTime: null, lastHitTime: null, hitTimes: [], hitCount: 0,
  })
})

test('CT・命中準備時間の範囲外や巨大な計算は拒否する', () => {
  const model = derive(yId)
  for (const ct of [-0.01, NaN, Infinity, 1.26]) {
    assert.equal(calculateSurtrRemnantAttacks(model, ct, assumptions), null)
  }
  for (const windup of [-0.01, NaN, Infinity, 1]) {
    assert.equal(calculateSurtrRemnantAttacks(model, 0.3, { ...assumptions, windup }), null)
  }
  for (const key of ['attackIntervalBefore', 'attackIntervalAfter', 'remnantDuration', 'attackSpeedBefore', 'attackSpeedAfter']) {
    for (const value of [0, -1, NaN, Infinity]) {
      assert.equal(calculateSurtrRemnantAttacks({ ...model, [key]: value }, 0.3, assumptions), null)
    }
  }
  assert.equal(calculateSurtrRemnantAttacks({ ...model, attackIntervalAfter: 1e-10 }, 0,
    { ...assumptions, windup: 0 }), null)
  assert.equal(calculateSurtrRemnantAttacks(model, 0, { ...assumptions, ctCarry: 'reset' as 'time' }), null)
  assert.equal(calculateSurtrRemnantAttacks(model, 0, { ...assumptions, includeRetreatHit: 1 as unknown as boolean }), null)
})

test('CT表は最長の攻撃間隔、命中準備時間は共通上限から0.01秒単位で切り下げる', () => {
  const models = [derive(), derive(xId), derive(yId)]
  assert.equal(getSurtrRemnantCtLimit(models), 1.25)
  assert.equal(getSurtrRemnantWindupLimit(models), 0.96)
  assert.equal(getSurtrRemnantCtLimit([models[1]]), 1.15)
  assert.equal(getSurtrRemnantCtLimit([models[0], models[2]]), 1.25)
  assert.equal(getSurtrRemnantWindupLimit([models[0]]), 1.25)
  assert.equal(getSurtrRemnantCtLimit([]), null)
  assert.equal(getSurtrRemnantWindupLimit([{ ...models[0], attackIntervalAfter: NaN }]), null)
  assert.equal(getSurtrRemnantCtLimit([{ ...models[0], attackIntervalBefore: 0.29 }]), 0.29)
  assert.equal(getSurtrRemnantCtLimit([{ ...models[0], attackIntervalBefore: 0.29 - 1e-9 }]), 0.28)
})

test('0.1秒刻みの最終1.2秒行は未装備とYを計算し、未ブロックXだけ範囲外になる', () => {
  const models = [derive(), derive(xId), derive(yId)]
  const limit = getSurtrRemnantCtLimit(models)!
  const samples = buildSurtrRemnantCtSamples(limit, 0.1)
  assert.equal(samples.length, 13)
  assert.equal(samples.at(-1), 1.2)
  assert.deepEqual(models.map(model => calculateSurtrRemnantAttacks(model, 1.2, assumptions)?.hitCount ?? null),
    [6, null, 8])
  assert.equal(calculateSurtrRemnantAttacks(derive(xId, { blocking: true }), 1.2, assumptions)?.hitCount, 6)
})

test('CT表は等間隔で生成し、刻みに乗らない上限を追加しない', () => {
  assert.deepEqual(buildSurtrRemnantCtSamples(0.3, 0.1), [0, 0.1, 0.2, 0.3])
  assert.deepEqual(buildSurtrRemnantCtSamples(0.12, 0.05), [0, 0.05, 0.1])
  assert.deepEqual(buildSurtrRemnantCtSamples(0, 0.01), [0])
  assert.deepEqual(buildSurtrRemnantCtSamples(0.02, 0.1), [0])
  assert.equal(buildSurtrRemnantCtSamples(0.29, 0.01).at(-1), 0.29)
  assert.equal(buildSurtrRemnantCtSamples(0.29 - 1e-9, 0.01).at(-1), 0.28)
  for (const step of [0.01, 0.05, 0.1] as const) {
    const samples = buildSurtrRemnantCtSamples(1.25, step)
    assert.equal(samples[0], 0)
    assert.equal(samples.at(-1), step === 0.1 ? 1.2 : 1.25)
    assert.ok(samples.every((sample, index) => Number.isFinite(sample) && sample <= 1.25
      && (index === 0 || sample > samples[index - 1])))
    for (let index = 1; index < samples.length; index += 1) close(samples[index] - samples[index - 1], step)
    assert.equal(new Set(samples).size, samples.length)
  }
  for (const limit of [-1, NaN, Infinity, 1e10]) assert.deepEqual(buildSurtrRemnantCtSamples(limit, 0.01), [])
  assert.deepEqual(buildSurtrRemnantCtSamples(1.15, 0.02 as SurtrRemnantCtStep), [])
})

function yBlackboard(record: SkillRecord): Record<string, number> {
  return record.operatorProfile.modules![1].phases![2].parts![1]
    .addOrOverrideTalentDataBundle!.candidates![0].blackboard as Record<string, number>
}

// Compact JP character/skill/battle_equip data, shared values with the existing S3 model fixtures.
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
      talents: [{ candidates: [{ name: '劫火', requiredPotentialRank: 0,
        unlockCondition: { phase: 'PHASE_2', level: 1 },
        blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 20 }],
      }] }, { candidates: [0, 2].map(rank => ({
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
        { addOrOverrideTalentDataBundle: { candidates: type === 'X' || level === 1 ? []
          : [0, 2].map(rank => ({ talentIndex: 1, name: '余燼', requiredPotentialRank: rank,
            blackboard: { 'surtr_t_2[withdraw].interval': (level === 3 ? 9 : 8) + (rank ? 1 : 0),
              'surtr_t_2[withdraw].attack_speed': level === 3 ? 30 : 20 },
          })),
        } },
      ],
    })),
  }
}

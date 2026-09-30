import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import {
  calculateSurtrDuration,
  deriveSurtrDurationModel,
  type SurtrDurationSettings,
} from '../src/lib/surtrDuration.ts'
import type { RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

const defaults: SurtrDurationSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9 }
const xId = 'uniequip_002_surtr'
const yId = 'uniequip_003_surtr'

function derive(moduleId = '', changes: Partial<SurtrDurationSettings> = {}, moduleLevel = 3) {
  const model = deriveSurtrDurationModel(createRecord(), { ...defaults, ...changes }, moduleId, moduleLevel)
  assert.ok(model)
  return model
}

function result(moduleId = '', changes: Partial<SurtrDurationSettings> = {}, moduleLevel = 3) {
  const value = calculateSurtrDuration(derive(moduleId, changes, moduleLevel))
  assert.ok(value)
  return value
}

test('S3は増加後の最大HPまで全回復し、時間軸に発動準備0.6秒を含める', () => {
  const model = derive()
  assert.equal(model.baseMaxHp, 2916)
  assert.equal(model.skillHpBonus, 5000)
  assert.equal(model.maxHp, 7916)
  assert.equal(model.activationDelay, 0.6)
  assert.equal(model.skillLevelLabel, '特化3')
  assert.equal(model.calculationKind, 'tick-estimate')
  const value = result()
  assert.deepEqual(value.points.slice(0, 2).map(({ time, hp, maxHp, hpPercent }) => (
    { time, hp, maxHp, hpPercent }
  )), [
    { time: 0, hp: 2916, maxHp: 2916, hpPercent: 100 },
    { time: 0.6, hp: 7916, maxHp: 7916, hpPercent: 100 },
  ])
})

test('0.2秒の離散減少は区間長を掛ける: 121回目は生存し122回目で余燼', () => {
  const value = result()
  const first = value.drainSchedule[0]
  assert.equal(first.time, 0.8)
  assert.ok(Math.abs(first.rate - 0.2 / 300) < 1e-12)
  assert.ok(Math.abs(first.hpLoss - 7916 / 7500) < 1e-9)
  assert.equal(value.drainSchedule.length, 122)
  // Sum n=1..121 of n/7500 = 7381/7500 of maximum HP removed.
  const beforeFatal = value.drainSchedule.at(-2)!
  assert.equal(beforeFatal.time, 24.8)
  assert.ok(Math.abs(beforeFatal.hpAfter - 7916 * (1 - 7381 / 7500)) < 1e-8)
  assert.equal(value.remnantStart, 25)
  assert.equal(value.remnantDuration, 8)
  assert.equal(value.retreatTime, 33)
})

test('未装備とXは継続時間が同じ、Y Lv3は余燼だけ1秒延長する', () => {
  const none = result()
  const x = result(xId)
  const y = result(yId)
  assert.deepEqual(x, none)
  assert.deepEqual(y.drainSchedule, none.drainSchedule)
  assert.equal(y.remnantStart, none.remnantStart)
  assert.equal(y.remnantDuration, 9)
  assert.equal(y.retreatTime, 34)
  assert.deepEqual([1, 2, 3].map(level => result(yId, {}, level).remnantDuration), [8, 8, 9])
})

test('潜在3の余燼延長をMODと重複加算せず候補データから取得する', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(potential => result('', { potential }).retreatTime),
    [33, 33, 34, 34, 34, 34])
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(potential => result(yId, { potential }).retreatTime),
    [34, 34, 35, 35, 35, 35])
  assert.deepEqual([1, 2, 3].map(level => result(yId, { potential: 3 }, level).remnantDuration), [9, 9, 10])
})

test('余燼中はHP1を保ち、強制退場をHP0へのダメージとして描かない', () => {
  const value = result(yId)
  const remnant = value.points.filter(point => point.phase === 'remnant')
  assert.equal(remnant.length, 2)
  assert.deepEqual(remnant.map(point => [point.time, point.hp]), [[25, 1], [34, 1]])
  assert.ok(remnant.every(point => Math.abs(point.hpPercent - 100 / 7916) < 1e-12))
  assert.ok(value.points.every(point => point.hp > 0 && point.hpPercent > 0 && point.hpPercent <= 100))
  assert.ok(value.points.every((point, i) => i === 0 || point.time > value.points[i - 1].time))
})

test('全スキルランク・HPレベルは百分率のHP減少時間を変えない', () => {
  assert.equal(derive('', { level: 1, trust: 0 }).maxHp, 7216)
  assert.equal(derive('', { level: 45, trust: 50 }).baseMaxHp, 2562)
  for (const level of [1, 45, 60, 90]) {
    for (let skillLevelIndex = 0; skillLevelIndex < 10; skillLevelIndex += 1) {
      assert.equal(result('', { level, skillLevelIndex }).remnantStart, 25)
    }
  }
})

test('減少率はdurationで上限となり以降に増えない', () => {
  // A slower synthetic drain exercises the cap that normal no-healing Surtr
  // never reaches; it also checks the model does not hardcode 25 seconds.
  const value = calculateSurtrDuration({ ...derive(), maxDrainRate: 0.01, rampDuration: 1 })!
  assert.ok(value)
  const capped = value.drainSchedule.filter(tick => tick.time >= 1.6)
  assert.ok(capped.length > 100)
  assert.ok(capped.every(tick => tick.rate === 0.01))
  assert.ok(value.remnantStart > 100)
})

test('育成条件、MOD解放、不足したHP・減少・余燼のデータを検証する', () => {
  for (const patch of [
    { level: 0 }, { level: 91 }, { level: 3.5 }, { trust: -1 }, { trust: 101 }, { trust: NaN },
    { potential: 0 }, { potential: 7 }, { potential: 1.5 }, { skillLevelIndex: -1 }, { skillLevelIndex: 10 },
  ]) assert.equal(deriveSurtrDurationModel(createRecord(), { ...defaults, ...patch }), null)
  assert.equal(deriveSurtrDurationModel(createRecord(), { ...defaults, level: 59 }, xId), null)
  for (const level of [0, 4, 1.5, Infinity]) {
    assert.equal(deriveSurtrDurationModel(createRecord(), defaults, xId, level), null)
  }
  assert.equal(deriveSurtrDurationModel(createRecord(), defaults, 'unknown'), null)
  const mutations: Array<(record: SkillRecord) => void> = [
    record => { record.operatorId = 'other' },
    record => { record.skillIndex = 2 },
    record => { record.operatorProfile.phases[2].attributesKeyFrames![0].data!.maxHp = undefined },
    record => { record.operatorProfile.favorKeyFrames = [] },
    record => { record.skillLevels[9].blackboard = [] },
    record => { record.skillLevels[9].blackboard![1].value = 0 },
    record => { record.operatorProfile.talents = [] },
  ]
  for (const mutate of mutations) {
    const record = createRecord()
    mutate(record)
    assert.equal(deriveSurtrDurationModel(record, defaults), null)
  }
})

test('直接与えたモデルの不正値と過大な計算回数を拒否する', () => {
  for (const patch of [
    { maxHp: 1 }, { baseMaxHp: 0 }, { activationDelay: -1 }, { drainInterval: 0 },
    { rampDuration: NaN }, { maxDrainRate: 0 }, { remnantDuration: -1 }, { drainInterval: 1e-12 },
  ]) assert.equal(calculateSurtrDuration({ ...derive(), ...patch }), null)
})

// Compact fixture from JP character/skill/battle_equip tables checked 2026-09-30.
function createRecord(): SkillRecord {
  const skillLevels = Array.from({ length: 10 }, () => ({
    name: 'ラグナロク', description: '最大HP+5000、60秒後に最大HPの20%/秒になる',
    duration: -1, durationType: 'NONE', skillType: 'MANUAL', blackboard: [
      { key: 'max_hp', value: 5000 }, { key: 'interval', value: 0.2 },
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
        { level: 1, data: { maxHp: 2216 } }, { level: 90, data: { maxHp: 2916 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { maxHp: 0 } }, { level: 50, data: { maxHp: 0 } }],
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
      attributeBlackboard: type === 'X'
        ? { atk: [30, 48, 60][index], magic_resistance: 5 }
        : { atk: [45, 55, 60][index], def: [42, 56, 65][index] },
      parts: type === 'X' || level === 1 ? [] : [{
        addOrOverrideTalentDataBundle: { candidates: [0, 2].map(rank => ({
          talentIndex: 1, name: '余燼', requiredPotentialRank: rank,
          blackboard: {
            'surtr_t_2[withdraw].interval': (level === 3 ? 9 : 8) + (rank ? 1 : 0),
            'surtr_t_2[withdraw].attack_speed': level === 3 ? 30 : 20,
          },
        })) },
      }],
    })),
  }
}

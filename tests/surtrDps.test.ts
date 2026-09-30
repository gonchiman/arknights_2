import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import { calculateSurtrDpsCalculation } from '../src/lib/surtrDpsCalculation.ts'
import {
  buildSurtrDpsCurve,
  calculateSurtrDps,
  deriveSurtrDpsModel,
  SURTR_OPERATOR_ID,
  type SurtrDpsSettings,
} from '../src/lib/surtrDps.ts'
import type { OperatorCombatProfile, RawOperatorModule, SkillRecord } from '../src/types/skill.ts'

const defaults: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }
const xId = 'uniequip_002_surtr'
const yId = 'uniequip_003_surtr'

function model(moduleId = '', settings: Partial<SurtrDpsSettings> = {}, moduleLevel = 3) {
  const value = deriveSurtrDpsModel(createRecord(), { ...defaults, ...settings }, moduleId, moduleLevel)
  assert.ok(value)
  return value
}

function close(actual: number | null, expected: number) {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) < 1e-8, `${actual} != ${expected}`)
}

test('昇進2Lv90・信頼100・特化3: 加算した基礎攻撃力にS3倍率を掛ける', () => {
  const base = model()
  assert.equal(base.baseAttack, 772)
  assert.equal(base.effectiveAttack, 3319)
  assert.equal(base.skillAttackBonusPercent, 330)
  assert.equal(base.skillLevelLabel, '特化3')
  assert.equal(base.attackInterval, 1.25)
  assert.equal(base.resistanceIgnore, 20)
  close(calculateSurtrDps(base, 0), 2655.2)
  close(calculateSurtrDps(base, 20), 2655.2)
  close(calculateSurtrDps(base, 60), 1593.12)
  close(calculateSurtrDps(base, 100), 531.04)
  const x = model(xId)
  assert.equal(x.baseAttack, 832)
  assert.equal(x.effectiveAttack, 3577)
  assert.equal(x.operatorStats.baseAttackBreakdown.moduleAttack, 60)
  assert.equal(x.operatorStats.baseAttackBreakdown.trustAttack, 100)
})

test('X: 非ブロック時だけ攻速+8、術耐性無視はブロック状態によらず適用', () => {
  const free = model(xId)
  const blocked = model(xId, { blocking: true })
  assert.equal(free.attackSpeed, 108)
  assert.equal(free.attackInterval, 1.25 / 1.08)
  assert.equal(blocked.attackSpeed, 100)
  assert.equal(free.resistanceIgnore, 26)
  assert.equal(blocked.resistanceIgnore, 26)
  close(calculateSurtrDps(free, 0), 3090.528)
  close(calculateSurtrDps(free, 26), 3090.528)
  close(calculateSurtrDps(free, 27), 3059.62272)
  close(calculateSurtrDps(free, 100), 803.53728)
  close(calculateSurtrDps(free, 60)! / calculateSurtrDps(blocked, 60)!, 1.08)
})

test('Y: 自身でブロックした単体にだけ対術脆弱10%、余燼の攻速+30は除外', () => {
  const free = model(yId)
  const blocked = model(yId, { blocking: true })
  assert.equal(free.attackSpeed, 100)
  assert.equal(blocked.attackSpeed, 100)
  assert.equal(free.artsFragility, 0)
  close(blocked.artsFragility, 0.1)
  assert.equal(blocked.resistanceIgnore, 20)
  close(calculateSurtrDps(free, 0), 2861.6)
  close(calculateSurtrDps(blocked, 0), 3147.76)
  close(calculateSurtrDps(blocked, 100), 629.552)
})

test('モジュールLv1〜3の加算ATKとXの段階別素質をゲームデータから読む', () => {
  assert.deepEqual([1, 2, 3].map(level => {
    const value = model(xId, {}, level)
    return [value.operatorStats.baseAttackBreakdown.moduleAttack, value.resistanceIgnore]
  }), [[30, 20], [48, 24], [60, 26]])
  assert.deepEqual([1, 2, 3].map(level => {
    const value = model(yId, { blocking: true }, level)
    return [value.operatorStats.baseAttackBreakdown.moduleAttack, value.attackSpeed, value.resistanceIgnore]
  }), [[45, 100, 20], [55, 100, 20], [60, 100, 20]])
})

test('潜在4のATK+28、潜在5の術耐性無視+2を別々に適用する', () => {
  for (const moduleId of ['', xId, yId]) {
    const p3 = model(moduleId, { potential: 3 })
    const p4 = model(moduleId, { potential: 4 })
    const p5 = model(moduleId, { potential: 5 })
    assert.equal(p4.baseAttack, p3.baseAttack + 28)
    assert.equal(p4.resistanceIgnore, p3.resistanceIgnore)
    assert.equal(p5.baseAttack, p4.baseAttack)
    assert.equal(p5.resistanceIgnore, p4.resistanceIgnore + 2)
  }
  assert.equal(model(xId, { potential: 5 }, 1).resistanceIgnore, 22)
  assert.equal(model(xId, { potential: 5 }, 2).resistanceIgnore, 26)
  assert.equal(model(xId, { potential: 5 }, 3).resistanceIgnore, 28)
})

test('潜在3の余燼強化と余燼の時間・攻速・HP減少パラメータはDPSを変えない', () => {
  close(calculateSurtrDps(model(yId, { potential: 2 }), 50), calculateSurtrDps(model(yId, { potential: 3 }), 50)!)
  const record = createRecord()
  for (const candidate of record.operatorProfile.talents![1].candidates!) {
    candidate.blackboard = [{ key: 'surtr_t_2[withdraw].attack_speed', value: 9999 }]
  }
  for (const phase of record.operatorProfile.modules![1].phases!) {
    phase.parts![1].addOrOverrideTalentDataBundle!.candidates![0].blackboard = {
      'surtr_t_2[withdraw].attack_speed': 9999,
      'surtr_t_2[withdraw].interval': 9999,
    }
  }
  record.skillLevels[9].blackboard!.push({ key: 'interval', value: 0.01 }, { key: 'duration', value: 9999 })
  const changed = deriveSurtrDpsModel(record, defaults, yId, 3)!
  assert.equal(changed.attackSpeed, 100)
  close(calculateSurtrDps(changed, 50), calculateSurtrDps(model(yId), 50)!)
})

test('レベル・信頼度・スキルランク変更を反映し、対象数は単体DPSに掛けない', () => {
  const low = model('', { level: 1, trust: 0, skillLevelIndex: 0 })
  assert.equal(low.baseAttack, 544)
  assert.equal(low.effectiveAttack, 1523)
  close(calculateSurtrDps(low, 0), 1218.4)
  assert.equal(model('', { level: 1, trust: 50 }).baseAttack, 594)
  assert.equal(model('', { level: 45, trust: 0 }).baseAttack, 607)
  const record = createRecord()
  record.skillLevels[9].blackboard!.push({ key: 'attack@max_target', value: 99 })
  close(calculateSurtrDps(deriveSurtrDpsModel(record, defaults)!, 0), 2655.2)
})

test('術耐性0〜100を101点で出力し、術耐性無視以下は同じDPS', () => {
  const points = buildSurtrDpsCurve(model(xId))
  assert.equal(points.length, 101)
  assert.equal(points[0].resistance, 0)
  assert.equal(points.at(-1)!.resistance, 100)
  assert.ok(points.slice(0, 27).every(point => point.dps === points[0].dps))
  assert.ok(points.every((point, i) => i === 0 || point.dps <= points[i - 1].dps))
})

test('術ダメージの最低保証5%を適用後に対術脆弱を掛ける', () => {
  const value = { ...model(), effectiveAttack: 1000, attackInterval: 1, resistanceIgnore: 0, artsFragility: 0.1 }
  close(calculateSurtrDps(value, 95), 55)
  close(calculateSurtrDps(value, 100), 55)
})

test('MOD解放レベル・選択段階・育成設定の不正値は計算しない', () => {
  assert.equal(deriveSurtrDpsModel(createRecord(), { ...defaults, level: 59 }, xId), null)
  assert.ok(deriveSurtrDpsModel(createRecord(), { ...defaults, level: 60 }, xId))
  assert.ok(deriveSurtrDpsModel(createRecord(), { ...defaults, level: 1 }))
  for (const moduleLevel of [0, 1.5, 4, NaN]) assert.equal(deriveSurtrDpsModel(createRecord(), defaults, xId, moduleLevel), null)
  assert.equal(deriveSurtrDpsModel(createRecord(), defaults, 'missing'), null)
  for (const patch of [
    { level: 0 }, { level: 91 }, { level: 1.5 }, { trust: -1 }, { trust: 101 }, { trust: NaN },
    { potential: 0 }, { potential: 7 }, { potential: 1.5 }, { skillLevelIndex: -1 }, { skillLevelIndex: 10 },
  ]) assert.equal(deriveSurtrDpsModel(createRecord(), { ...defaults, ...patch }), null)
  for (const resistance of [-1, 101, NaN, Infinity]) assert.equal(calculateSurtrDps(model(), resistance), null)
  const bad = { ...model(), attackInterval: 0 }
  assert.deepEqual(buildSurtrDpsCurve(bad), [])
})

test('不足した元データを未装備やゼロ補正に置き換えず未計算にする', () => {
  const mutations: Array<(record: SkillRecord) => void> = [
    record => { record.operatorId = 'other' },
    record => { record.skillIndex = 2 },
    record => { record.operatorProfile.phases[2].attributesKeyFrames![0].data!.atk = undefined },
    record => { record.operatorProfile.favorKeyFrames = [] },
    record => { record.skillLevels[9].blackboard = [] },
    record => { record.operatorProfile.talents = [] },
    record => { record.operatorProfile.modules![0].phases = [] },
    record => { record.operatorProfile.modules![0].typeName2 = null },
    record => { record.operatorProfile.modules![0].phases![2].attributeBlackboard = {} },
    record => { record.operatorProfile.modules![0].phases![2].parts![0].overrideTraitDataBundle!.candidates = [] },
  ]
  for (const mutate of mutations) {
    const record = createRecord()
    mutate(record)
    assert.equal(deriveSurtrDpsModel(record, defaults, xId), null)
  }
})

test('計算詳細: MOD X・術耐性50の各段階とDPSを未丸めのまま返す', () => {
  const value = model(xId)
  const detail = calculateSurtrDpsCalculation(value, 50)!
  assert.deepEqual(detail.baseAttack, {
    levelAttack: 672, trustAttack: 100, potentialAttack: 0, moduleAttack: 60,
    beforeRounding: 832, result: 832,
  })
  close(detail.attackPipeline.afterDirectMultiplier, 3577.6)
  assert.equal(detail.attackPipeline.finalAttack, 3577)
  assert.equal(detail.mitigation.inputResistance, 50)
  assert.equal(detail.mitigation.resistanceIgnoreFixed, 26)
  assert.equal(detail.mitigation.appliedResistance, 24)
  close(detail.mitigation.afterResistance, 2718.52)
  assert.equal(detail.mitigation.minimumApplied, false)
  assert.equal(detail.artsFragilityMultiplier, 1)
  close(detail.perHit, 2718.52)
  assert.equal(detail.baseAttackTime, 1.25)
  assert.equal(detail.baseAttackSpeed, 100)
  assert.equal(detail.attackSpeedBonus, 8)
  assert.equal(detail.attackSpeed, 108)
  assert.equal(detail.appliedAttackSpeed, 108)
  assert.equal(detail.attackInterval, 1.25 * 100 / 108)
  close(detail.dps, 2348.80128)
  assert.equal(detail.dps, calculateSurtrDps(value, 50))
})

test('計算詳細: 基礎ATKの加算後に四捨五入し、S3倍率適用後に切り捨てる', () => {
  const detail = calculateSurtrDpsCalculation(model('', { level: 45, trust: 50.3 }), 0)!
  close(detail.baseAttack.levelAttack, 544 + 128 * 44 / 89)
  close(detail.baseAttack.trustAttack, 50.3)
  close(detail.baseAttack.beforeRounding, 657.5808988764045)
  assert.equal(detail.baseAttack.result, 658)
  assert.equal(detail.attackPipeline.baseAttack, 658)
  close(detail.attackPipeline.afterDirectMultiplier, 2829.4)
  assert.equal(detail.attackPipeline.finalAttack, 2829)
  assert.equal(detail.mitigation.attack, 2829)
  close(detail.dps, 2263.2)
})

test('計算詳細: MOD Yの対術脆弱は軽減後に適用し、余燼の攻速を含めない', () => {
  const free = calculateSurtrDpsCalculation(model(yId), 50)!
  const blocked = calculateSurtrDpsCalculation(model(yId, { blocking: true }), 50)!
  assert.equal(blocked.attackSpeedBonus, 0)
  assert.equal(blocked.attackSpeed, 100)
  assert.equal(blocked.attackInterval, 1.25)
  assert.equal(free.artsFragilityMultiplier, 1)
  close(blocked.artsFragilityMultiplier, 1.1)
  assert.equal(free.mitigation.result, blocked.mitigation.result)
  close(blocked.perHit, 2754.29)
  close(blocked.dps, 2203.432)
})

test('計算詳細: 潜在・MOD段階・ブロック状態・各術耐性で既存DPSと一致する', () => {
  for (const moduleId of ['', xId, yId]) {
    for (const moduleLevel of moduleId ? [1, 2, 3] : [0]) {
      for (const potential of [1, 4, 5, 6]) {
        for (const blocking of [false, true]) {
          const value = model(moduleId, { potential, blocking }, moduleLevel)
          for (const resistance of [0, 20, 26, 28, 50, 95, 100]) {
            const detail = calculateSurtrDpsCalculation(value, resistance)!
            assert.equal(detail.dps, calculateSurtrDps(value, resistance))
            assert.equal(detail.perHit / detail.attackInterval, detail.dps)
            assert.equal(detail.attackPipeline.finalAttack, value.effectiveAttack)
            assert.equal(detail.baseAttack.potentialAttack, potential >= 4 ? 28 : 0)
            assert.equal(detail.baseAttack.moduleAttack, value.operatorStats.baseAttackBreakdown.moduleAttack)
            assert.equal(detail.mitigation.resistanceIgnoreFixed, value.resistanceIgnore)
          }
        }
      }
    }
  }
})

test('計算詳細: 最低保証の後に対術脆弱を掛け、攻速下限20を示す', () => {
  const record = createRecord()
  for (const candidate of record.operatorProfile.talents![0].candidates!) {
    candidate.blackboard = [{ key: 'magic_resist_penetrate_fixed', value: 0 }]
  }
  for (const frame of record.operatorProfile.phases[2].attributesKeyFrames!) {
    frame.data!.attackSpeed = 10
  }
  const value = deriveSurtrDpsModel(record, { ...defaults, blocking: true }, yId)!
  const detail = calculateSurtrDpsCalculation(value, 100)!
  assert.equal(detail.mitigation.appliedResistance, 100)
  assert.equal(detail.mitigation.afterResistance, 0)
  assert.equal(detail.mitigation.minimumApplied, true)
  close(detail.mitigation.minimumDamage, 178.85)
  close(detail.mitigation.result, 178.85)
  close(detail.perHit, 196.735)
  assert.equal(detail.attackSpeed, 10)
  assert.equal(detail.appliedAttackSpeed, 20)
  assert.equal(detail.attackInterval, 6.25)
  close(detail.dps, 31.4776)
})

test('計算詳細: 不正な術耐性・計算モデルを数値に置き換えない', () => {
  for (const resistance of [-1, 101, NaN, Infinity]) {
    assert.equal(calculateSurtrDpsCalculation(model(), resistance), null)
  }
  for (const patch of [
    { effectiveAttack: 0 }, { effectiveAttack: NaN }, { effectiveAttack: Infinity },
    { attackInterval: 0 }, { attackInterval: -1 }, { attackInterval: Infinity },
    { resistanceIgnore: -1 }, { resistanceIgnore: NaN },
    { artsFragility: -1 }, { artsFragility: Infinity },
    { effectiveAttack: Number.MAX_VALUE, artsFragility: Number.MAX_VALUE },
  ]) assert.equal(calculateSurtrDpsCalculation({ ...model(), ...patch }, 50), null)
})

test('計算詳細: 入力モデルを変更せず、返した基礎ATK内訳も共有しない', () => {
  const value = model(xId, { potential: 5 })
  const before = structuredClone(value)
  const detail = calculateSurtrDpsCalculation(value, 50)!
  assert.deepEqual(value, before)
  assert.notEqual(detail.baseAttack, value.operatorStats.baseAttackBreakdown)
  detail.baseAttack.moduleAttack = 999
  detail.attackPipeline.finalAttack = 999
  detail.mitigation.resistanceIgnoreFixed = 999
  assert.deepEqual(value, before)
})

// Compact fixture from the same JP source used at runtime, checked 2026-09-30:
// https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/jp/gamedata/excel/{character,skill,uniequip,battle_equip}_table.json
function createRecord(): SkillRecord {
  const skillLevels = [1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.7, 3, 3.3].map(atk => ({
    name: 'ラグナロク', duration: -1, durationType: 'NONE', skillType: 'MANUAL',
    description: '攻撃力上昇、退場まで効果継続', blackboard: [{ key: 'atk', value: atk }],
  }))
  return {
    id: `${SURTR_OPERATOR_ID}:skchr_surtr_3`, operatorId: SURTR_OPERATOR_ID, operatorName: 'スルト',
    profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'artsfghter', subProfessionName: '術戦士',
    nameInitial: 'S_ROW', rarity: 6, skillIndex: 3, skillId: 'skchr_surtr_3', skillName: 'ラグナロク',
    description: '', duration: -1, durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME',
    initSp: 0, spCost: 5, classification: classifySkill(skillLevels[9]), skillLevels,
    operatorProfile: createProfile(), raw: skillLevels[9],
  }
}

function createProfile(): OperatorCombatProfile {
  return {
    phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
      { level: 1, data: { atk: 544, attackSpeed: 100, baseAttackTime: 1.25 } },
      { level: 90, data: { atk: 672, attackSpeed: 100, baseAttackTime: 1.25 } },
    ] }],
    favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: 100 } }],
    traitDescription: '敵に術ダメージを与える',
    talents: [
      { candidates: [0, 4].map(rank => ({ name: '劫火', unlockCondition: { phase: 'PHASE_2', level: 1 },
        requiredPotentialRank: rank, blackboard: [{ key: 'magic_resist_penetrate_fixed', value: rank ? 22 : 20 }] })) },
      { candidates: [0, 2].map(rank => ({ name: '余燼', unlockCondition: { phase: 'PHASE_2', level: 1 },
        requiredPotentialRank: rank, blackboard: [{ key: 'surtr_t_2[withdraw].interval', value: rank ? 9 : 8 }] })) },
    ],
    potentialRanks: [{}, {}, { buff: { attributes: { attributeModifiers: [
      { attributeType: 'ATK', formulaItem: 'ADDITION', value: 28 },
    ] } } }, {}, {}],
    modules: [createModule('X'), createModule('Y')],
  }
}

function createModule(type: 'X' | 'Y'): RawOperatorModule {
  return {
    uniEquipId: type === 'X' ? xId : yId, uniEquipName: `MOD ${type}`, type: 'ADVANCED', typeName2: type,
    unlockEvolvePhase: 'PHASE_2', unlockLevel: 60,
    phases: [1, 2, 3].map((level, index) => ({
      equipLevel: level,
      attributeBlackboard: type === 'X' ? { atk: [30, 48, 60][index], magic_resistance: 5 }
        : { atk: [45, 55, 60][index], def: [42, 56, 65][index] },
      parts: [
        { overrideTraitDataBundle: { candidates: [{ requiredPotentialRank: 0,
          additionalDescription: type === 'X' ? '未ブロック時、攻撃速度+8' : '自身がブロックしている敵に10%の対術脆弱',
          blackboard: type === 'X' ? { attack_speed: 8 } : { damage_scale: 1.1 },
        }] } },
        { addOrOverrideTalentDataBundle: { candidates: type === 'X'
          ? (level === 1 ? [] : [0, 4].map(rank => ({ talentIndex: 0, name: '劫火', requiredPotentialRank: rank,
            blackboard: { magic_resist_penetrate_fixed: [20, 24, 26][index] + (rank ? 2 : 0) },
          })))
          : [0, 2].map(rank => ({ talentIndex: 1, name: '余燼', requiredPotentialRank: rank,
            blackboard: { 'surtr_t_2[withdraw].interval': (level === 3 ? 9 : 8) + (rank ? 1 : 0),
              'surtr_t_2[withdraw].attack_speed': level === 3 ? 30 : level === 2 ? 20 : 0 },
          })),
        } },
      ],
    })),
  }
}

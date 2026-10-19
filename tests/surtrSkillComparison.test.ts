import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { classifySkill } from '../src/lib/classifier.ts'
import { calculateSurtrDps, deriveSurtrDpsModel, type SurtrDpsSettings } from '../src/lib/surtrDps.ts'
import {
  calculateSurtrSkillDps, deriveSurtrSkillDpsModel, DEFAULT_SURTR_SKILL_EXTERNAL_BUFFS,
  getSurtrSkillExternalBuffLabel, isValidSurtrSkillExternalBuffs,
} from '../src/lib/surtrSkillComparison.ts'
import type { OperatorCombatProfile, RawOperatorModule, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const defaults: SurtrDpsSettings = { level: 90, trust: 100, potential: 1, skillLevelIndex: 9, blocking: false }
const xId = 'uniequip_002_surtr'
const yId = 'uniequip_003_surtr'
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/skillStructureFourOperators.json', import.meta.url), 'utf8')) as
  Array<{ operatorId: string; skills: Array<RawSkillLevel & { skillIndex: number; skillId: string }> }>

function model(skillIndex: 2 | 3, moduleId = '', settings: Partial<SurtrDpsSettings> = {}, moduleLevel = 3) {
  const value = deriveSurtrSkillDpsModel(createRecord(skillIndex), { ...defaults, ...settings }, moduleId, moduleLevel)
  assert.ok(value)
  return value
}

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
}

test('S2単体はATK+120%後の切り捨てに1.6倍を掛け、共通の術軽減・DPSへ進む', () => {
  const value = model(2)
  const result = calculateSurtrSkillDps(value, 60, 1)!
  assert.equal(value.skillIndex, 2)
  assert.equal(value.maximumTargets, 2)
  assert.equal(value.singleTargetAttackScale, 1.6)
  assert.equal(value.baseAttack, 772)
  assert.equal(value.effectiveAttack, 1698)
  assert.equal(result.attackScale, 1.6)
  close(result.attackPipeline.afterDirectMultiplier, 1698.4)
  assert.equal(result.attackPipeline.afterFinalMultiplier, 1698)
  close(result.attackPipeline.finalAttack, 2716.8)
  close(result.mitigation.appliedResistance, 40)
  close(result.damagePerAttack, 1630.08)
  close(result.totalDps, 1304.064)
  close(calculateSurtrSkillDps(value, 0, 1)!.totalDps, 2173.44)
})

test('敵1〜4体に対しS2は単体倍率・上限2体、S3は上限4体を反映する', () => {
  const s2 = model(2), s3 = model(3)
  assert.deepEqual([1, 2, 3, 4].map(count => calculateSurtrSkillDps(s2, 0, count)!.attackTargetCount), [1, 2, 2, 2])
  assert.deepEqual([1, 2, 3, 4].map(count => calculateSurtrSkillDps(s3, 0, count)!.attackTargetCount), [1, 2, 3, 4])
  assert.deepEqual([1, 2, 3, 4].map(count => calculateSurtrSkillDps(s2, 0, count)!.attackScale), [1.6, 1, 1, 1])
  for (const count of [1, 2, 3, 4]) {
    close(calculateSurtrSkillDps(s2, 0, count)!.totalDps, count === 1 ? 2173.44 : 2716.8)
    close(calculateSurtrSkillDps(s3, 0, count)!.totalDps, 2655.2 * count)
  }
})

test('S3はランク1〜特化2で3体、特化3で4体の上限を選択レベルの実データから読む', () => {
  const record = createRecord(3)
  for (let skillLevelIndex = 0; skillLevelIndex < 10; skillLevelIndex += 1) {
    for (const moduleId of ['', xId, yId]) for (const blocking of [false, true]) {
      const settings = { ...defaults, skillLevelIndex, blocking }
      const value = deriveSurtrSkillDpsModel(record, settings, moduleId)!
      const legacy = deriveSurtrDpsModel(record, settings, moduleId)!
      assert.ok(value)
      assert.equal(value.maximumTargets, skillLevelIndex === 9 ? 4 : 3)
      const result = calculateSurtrSkillDps(value, 60, 4)!
      assert.equal(result.attackTargetCount, skillLevelIndex === 9 ? 4 : 3)
      assert.equal(result.blockedTargetCount, blocking ? 1 : 0)
      assert.equal(result.unblockedTargetCount, result.attackTargetCount - result.blockedTargetCount)
      assert.equal(calculateSurtrSkillDps(value, 60, 1)!.totalDps, calculateSurtrDps(legacy, 60))
      if (skillLevelIndex < 9) {
        assert.equal(result.totalDps, calculateSurtrSkillDps(value, 60, 3)!.totalDps)
      }
    }
  }
  close(calculateSurtrSkillDps(model(3, '', { skillLevelIndex: 0 }), 0, 4)!.totalDps, 5186.4)
  close(calculateSurtrSkillDps(model(3, '', { skillLevelIndex: 8 }), 0, 4)!.totalDps, 7411.2)
  close(calculateSurtrSkillDps(model(3), 0, 4)!.totalDps, 10620.8)
})

test('MOD Yの脆弱はブロックした1体だけに適用し、未ブロックの他対象へ広げない', () => {
  for (const skill of [2, 3] as const) {
    for (const count of [1, 2, 3, 4]) {
      const free = calculateSurtrSkillDps(model(skill, yId), 50, count)!
      const blocked = calculateSurtrSkillDps(model(skill, yId, { blocking: true }), 50, count)!
      assert.equal(free.blockedTargetCount, 0)
      assert.equal(blocked.blockedTargetCount, 1)
      assert.equal(blocked.unblockedTargetCount, blocked.attackTargetCount - 1)
      close(blocked.unblockedTargetDamage, free.unblockedTargetDamage)
      close(blocked.blockedTargetDamage, free.unblockedTargetDamage * 1.1)
      close(blocked.totalDps, free.totalDps + free.unblockedTargetDamage * 0.1 / free.attackInterval)
    }
  }
})

test('MOD Xの攻速は敵数によらず未ブロック時だけ、余燼攻速は各段階・潜在を共有する', () => {
  for (const skill of [2, 3] as const) {
    for (const count of [1, 2, 3, 4]) {
      const free = calculateSurtrSkillDps(model(skill, xId), 60, count)!
      const blocked = calculateSurtrSkillDps(model(skill, xId, { blocking: true }), 60, count)!
      close(free.totalDps / blocked.totalDps, 1.08)
    }
    for (const moduleId of ['', xId, yId]) for (const level of moduleId ? [1, 2, 3] : [0]) {
      for (const potential of [1, 3, 4, 5, 6]) for (const blocking of [false, true]) {
        const before = model(skill, moduleId, { potential, blocking }, level)
        const active = model(skill, moduleId, { potential, blocking, remnantActive: true }, level)
        const bonus = moduleId === yId ? level === 3 ? 30 : level === 2 ? 20 : 0 : 0
        assert.equal(active.remnantAttackSpeedBonus, bonus)
        assert.equal(active.attackSpeed, before.attackSpeed + bonus)
        assert.equal(active.baseAttack, before.baseAttack)
        assert.equal(active.resistanceIgnore, before.resistanceIgnore)
        for (const count of [1, 2, 4]) {
          const prior = calculateSurtrSkillDps(before, 60, count)!
          const result = calculateSurtrSkillDps(active, 60, count)!
          assert.equal(result.damagePerAttack, prior.damagePerAttack)
          close(result.totalDps, prior.totalDps * active.attackSpeed / before.attackSpeed)
        }
      }
    }
  }
})

test('S3単体は既存DPSと全MOD段階・潜在・ブロック・余燼・術耐性で一致する', () => {
  const record = createRecord(3)
  for (const moduleId of ['', xId, yId]) for (const level of moduleId ? [1, 2, 3] : [0]) {
    for (const potential of [1, 3, 4, 5, 6]) for (const blocking of [false, true]) for (const remnantActive of [false, true]) {
      const settings = { ...defaults, potential, blocking, remnantActive }
      const old = deriveSurtrDpsModel(record, settings, moduleId, level)!
      const current = deriveSurtrSkillDpsModel(record, settings, moduleId, level)!
      for (const resistance of [0, 20, 26, 28, 60, 95, 100]) {
        assert.equal(calculateSurtrSkillDps(current, resistance, 1)!.totalDps, calculateSurtrDps(old, resistance))
      }
    }
  }
  assert.equal(deriveSurtrDpsModel(createRecord(2), defaults), null)
})

test('S2は選択したスキルレベルの倍率を使い、入力元を変更しない', () => {
  const record = createRecord(2)
  record.skillLevels[0].blackboard = [
    { key: 'atk', value: 0.9 }, { key: 'attack@max_target', value: 2 },
    { key: 'attack@surtr_s_2[critical].atk_scale', value: 1.5 },
  ]
  const before = structuredClone(record)
  const low = deriveSurtrSkillDpsModel(record, { ...defaults, level: 45, trust: 50.3, skillLevelIndex: 0 })!
  const result = calculateSurtrSkillDps(low, 0, 1)!
  assert.equal(low.baseAttack, 658)
  assert.equal(low.skillAttackBonusPercent, 90)
  assert.equal(result.attackScale, 1.5)
  assert.equal(result.attackPipeline.afterFinalMultiplier, 1250)
  close(result.totalDps, 1500)
  assert.deepEqual(record, before)
})

test('対象上限や単体倍率の欠落・不正値を推測で補完しない', () => {
  for (const skillIndex of [2, 3] as const) {
    for (const maximumTargets of [undefined, 0, 1.5, 99, NaN, Infinity]) {
      const record = createRecord(skillIndex)
      record.skillLevels[9].blackboard!.find(entry => entry.key === 'attack@max_target')!.value = maximumTargets
      assert.equal(deriveSurtrSkillDpsModel(record, defaults), null)
    }
  }
  for (const singleTargetScale of [undefined, 0, -1, NaN, Infinity]) {
    const record = createRecord(2)
    record.skillLevels[9].blackboard!.find(entry => entry.key === 'attack@surtr_s_2[critical].atk_scale')!.value = singleTargetScale
    assert.equal(deriveSurtrSkillDpsModel(record, defaults), null)
  }
  const wrong = createRecord(2)
  wrong.operatorId = 'another'
  assert.equal(deriveSurtrSkillDpsModel(wrong, defaults), null)
  wrong.skillIndex = 1
  assert.equal(deriveSurtrSkillDpsModel(wrong, defaults), null)
})

test('不正な育成・敵条件・モデルは計算しない', () => {
  for (const settings of [{ level: 0 }, { level: 91 }, { trust: 101 }, { potential: 7 }, { skillLevelIndex: -1 }]) {
    assert.equal(deriveSurtrSkillDpsModel(createRecord(2), { ...defaults, ...settings }), null)
  }
  assert.equal(deriveSurtrSkillDpsModel(createRecord(2), { ...defaults, level: 59 }, xId), null)
  assert.equal(deriveSurtrSkillDpsModel(createRecord(2), defaults, 'unknown'), null)
  for (const count of [0, 1.5, 5, NaN, Infinity]) assert.equal(calculateSurtrSkillDps(model(2), 60, count), null)
  for (const resistance of [-1, 101, NaN, Infinity]) assert.equal(calculateSurtrSkillDps(model(2), resistance, 1), null)
  for (const patch of [{ attackInterval: 0 }, { maximumTargets: 99 }, { singleTargetAttackScale: NaN },
    { effectiveAttack: Infinity }, { resistanceIgnore: -1 }, { artsFragility: Infinity },
    { effectiveAttack: Number.MAX_VALUE, artsFragility: Number.MAX_VALUE }]) {
    assert.equal(calculateSurtrSkillDps({ ...model(2), ...patch }, 60, 2), null)
  }
})

test('外部バフが0なら省略時と完全一致し、計算後の攻撃力・攻速を返す', () => {
  for (const skill of [2, 3] as const) for (const moduleId of ['', xId, yId]) {
    for (const blocking of [false, true]) for (const remnantActive of [false, true]) {
      const value = model(skill, moduleId, { blocking, remnantActive })
      const before = structuredClone(value)
      for (const count of [1, 2, 4]) {
        const without = calculateSurtrSkillDps(value, 60, count)!
        const zero = calculateSurtrSkillDps(value, 60, count, DEFAULT_SURTR_SKILL_EXTERNAL_BUFFS)!
        assert.deepEqual(zero, without)
        assert.equal(zero.effectiveAttack, value.effectiveAttack)
        assert.equal(zero.attackSpeed, value.attackSpeed)
        assert.equal(zero.attackInterval, value.attackInterval)
      }
      assert.deepEqual(value, before)
    }
  }
})

test('攻撃力バフはスキル加算と足し合わせ、+150%と+200%では単体S2がS3を上回る', () => {
  for (const attackPercent of [150, 200]) for (const moduleId of ['', xId, yId]) {
    for (const blocking of [false, true]) for (const resistance of [0, 60, 100]) {
      const buffs = { attackPercent, attackAddition: 0, attackSpeed: 0 }
      const s2 = calculateSurtrSkillDps(model(2, moduleId, { blocking }), resistance, 1, buffs)!
      const s3 = calculateSurtrSkillDps(model(3, moduleId, { blocking }), resistance, 1, buffs)!
      assert.ok(s2.totalDps > s3.totalDps)
      close(s2.attackPipeline.directMultiplierPercent, 120 + attackPercent)
      close(s3.attackPipeline.directMultiplierPercent, 330 + attackPercent)
      assert.equal(s2.attackPipeline.finalAttack, s2.effectiveAttack * 1.6)
      assert.equal(s3.attackPipeline.finalAttack, s3.effectiveAttack)
    }
  }
  const buffs = { attackPercent: 150, attackAddition: 0, attackSpeed: 0 }
  const s2 = calculateSurtrSkillDps(model(2), 0, 2, buffs)!
  const s3 = calculateSurtrSkillDps(model(3), 0, 2, buffs)!
  assert.ok(s3.totalDps > s2.totalDps, '複数対象ではS2単体1.6倍を適用しない')
})

test('固定加算は割合加算の後、切り捨てとS2単体倍率の前に適用する', () => {
  const buffs = { attackPercent: 0, attackAddition: 100.75, attackSpeed: 0 }
  const before = structuredClone(buffs)
  const result = calculateSurtrSkillDps(model(2), 0, 1, buffs)!
  close(result.attackPipeline.afterDirectMultiplier, 1698.4)
  close(result.attackPipeline.afterFinalAddition, 1799.15)
  assert.equal(result.effectiveAttack, 1799)
  close(result.damagePerAttack, 2878.4)
  close(result.totalDps, 2302.72)
  assert.deepEqual(buffs, before)
  assert.notEqual(result.externalBuffs, buffs, '計算結果は入力バフを参照しない')
  const fixed = { ...buffs, attackAddition: 1100.25 }
  assert.ok(calculateSurtrSkillDps(model(2), 0, 1, fixed)!.totalDps
    > calculateSurtrSkillDps(model(3), 0, 1, fixed)!.totalDps)
})

test('外部攻速はMOD・ブロック・余燼の攻速へ加算し、同じMODのスキル優位を変えない', () => {
  const buffs = { attackPercent: 0, attackAddition: 0, attackSpeed: 75 }
  for (const moduleId of ['', xId, yId]) for (const level of moduleId ? [1, 2, 3] : [0]) {
    for (const blocking of [false, true]) for (const remnantActive of [false, true]) {
      const results = ([2, 3] as const).map(skill => {
        const value = model(skill, moduleId, { blocking, remnantActive }, level)
        const initial = calculateSurtrSkillDps(value, 60, 1)!
        const applied = calculateSurtrSkillDps(value, 60, 1, buffs)!
        assert.equal(applied.attackSpeed, value.attackSpeed + 75)
        close(applied.attackInterval, 125 / (value.attackSpeed + 75))
        assert.equal(applied.damagePerAttack, initial.damagePerAttack)
        close(applied.totalDps, initial.totalDps * (value.attackSpeed + 75) / value.attackSpeed)
        return applied
      })
      assert.ok(results[1].totalDps > results[0].totalDps)
    }
  }
  const slow = model(2)
  slow.attackSpeed = 5
  slow.operatorStats.baseAttackTime = 2
  close(calculateSurtrSkillDps(slow, 0, 1, { ...buffs, attackSpeed: 10 })!.attackInterval, 10)
})

test('外部バフは有限の非負数だけを受け取り、オーバーフローも計算しない', () => {
  assert.equal(isValidSurtrSkillExternalBuffs(DEFAULT_SURTR_SKILL_EXTERNAL_BUFFS), true)
  for (const invalid of [null, [], {}, '150', { attackPercent: 1, attackAddition: 2 }]) {
    assert.equal(isValidSurtrSkillExternalBuffs(invalid), false)
    assert.equal(calculateSurtrSkillDps(model(2), 0, 1, invalid as never), null)
  }
  for (const field of ['attackPercent', 'attackAddition', 'attackSpeed'] as const) {
    for (const bad of [-1, NaN, Infinity, -Infinity, '10', null]) {
      const buffs = { ...DEFAULT_SURTR_SKILL_EXTERNAL_BUFFS, [field]: bad }
      assert.equal(isValidSurtrSkillExternalBuffs(buffs), false)
      assert.equal(calculateSurtrSkillDps(model(2), 0, 1, buffs as never), null)
    }
    assert.equal(calculateSurtrSkillDps(model(2), 0, 1,
      { ...DEFAULT_SURTR_SKILL_EXTERNAL_BUFFS, [field]: Number.MAX_VALUE }), null)
  }
})

test('外部バフの条件文は0を省略し、有効な3条件を共通表記にする', () => {
  assert.equal(getSurtrSkillExternalBuffLabel(DEFAULT_SURTR_SKILL_EXTERNAL_BUFFS), '')
  assert.equal(getSurtrSkillExternalBuffLabel({ attackPercent: 150, attackAddition: 100.5, attackSpeed: 75 }),
    '外部バフ：攻撃力+150%・固定加算+100.5・攻撃速度+75')
  assert.equal(getSurtrSkillExternalBuffLabel({ attackPercent: 0, attackAddition: 0, attackSpeed: 75 }),
    '外部バフ：攻撃力+0%・固定加算+0・攻撃速度+75')
})

// Skill text/blackboards reuse the reviewed JP fixture; profile values match surtrDps.test.ts.
function createRecord(skillIndex: 2 | 3): SkillRecord {
  const raw = structuredClone(fixtures.find(value => value.operatorId === 'char_350_surtr')!.skills
    .find(value => value.skillIndex === skillIndex)!)
  return {
    id: `char_350_surtr:${raw.skillId}`, operatorId: 'char_350_surtr', operatorName: 'スルト',
    profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: 'artsfghter', subProfessionName: '術戦士',
    nameInitial: 'S_ROW', rarity: 6, skillIndex, skillId: raw.skillId, skillName: raw.name!,
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, initSp: raw.spData!.initSp!, spCost: raw.spData!.spCost!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, (_, index) => {
      const level = structuredClone(raw)
      if (skillIndex === 3) {
        level.blackboard!.find(entry => entry.key === 'atk')!.value = [1.8, 1.9, 2, 2.1, 2.2, 2.3, 2.4, 2.7, 3, 3.3][index]
        level.blackboard!.find(entry => entry.key === 'attack@max_target')!.value = index === 9 ? 4 : 3
      }
      return level
    }),
    operatorProfile: createProfile(), raw,
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

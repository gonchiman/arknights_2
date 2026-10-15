import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySkill } from '../src/lib/classifier.ts'
import {
  buildDamageCalculatorThreeOutput,
  DAMAGE_CALCULATOR_THREE_SELECTIONS,
  getDamageCalculatorThreeInputs,
  getDamageCalculatorThreeStructures,
  type DamageCalculatorThreeInput,
} from '../src/lib/damageCalculatorThree.ts'
import { findSkillStructure, type SkillStructure } from '../src/lib/skillStructure.ts'
import type { RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

function record(selectionIndex = 0): SkillRecord {
  const selection = DAMAGE_CALCULATOR_THREE_SELECTIONS[selectionIndex]
  const structure = findSkillStructure(selection)!
  const raw: RawSkillLevel = {
    name: structure.basicInfo.skillName, description: structure.source.rawDescription,
    duration: structure.source.duration, skillType: 'MANUAL',
    blackboard: structure.source.blackboard.map(entry => ({ ...entry })),
  }
  const arts = selection.operatorId === 'char_350_surtr'
  return {
    id: `${selection.operatorId}:${selection.skillId}`, operatorId: selection.operatorId,
    operatorName: structure.basicInfo.operatorName, profession: 'WARRIOR', professionLabel: '前衛',
    subProfessionId: arts ? 'artsfghter' : 'fearless', subProfessionName: arts ? '術戦士' : '勇士',
    nameInitial: 'S_ROW', rarity: 6, skillIndex: selection.skillIndex, skillId: selection.skillId,
    skillName: structure.basicInfo.skillName, description: raw.description!, duration: raw.duration!,
    durationType: 'NONE', skillType: 'MANUAL', spType: 'INCREASE_WITH_TIME', initSp: 0, spCost: 10,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: {
      phases: [{ maxLevel: 50 }, { maxLevel: 80 }, { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { atk: arts ? 544 : 800, baseAttackTime: arts ? 1.25 : 1.5, attackSpeed: 100 } },
        { level: 90, data: { atk: arts ? 672 : 1015, baseAttackTime: arts ? 1.25 : 1.5, attackSpeed: 100 } },
      ] }],
      favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 50, data: { atk: arts ? 100 : 80 } }],
      traitDescription: arts ? '敵に術ダメージを与える' : '通常攻撃',
      talents: [{ candidates: [{ description: '攻撃力+99%、術耐性を20無視', blackboard: [
        { key: 'atk', value: 0.99 }, { key: 'magic_resist_penetrate_fixed', value: 20 },
      ] }] }],
      potentialRanks: [{ buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', value: 28 }] } } }],
      modules: [{ uniEquipId: 'test_module', phases: [{ equipLevel: 3, attributeBlackboard: { atk: 60, attack_speed: 30 } }] }],
    },
  }
}

function output(skill = record(), patch: Partial<DamageCalculatorThreeInput> = {}) {
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2,
    operatorLevel: 90, trust: 100, skillLevelIndex: 9, ...patch })
}

function close(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)
}

test('初期対応はスルトS2とスカジS1の特化3で、同じ構造化レコードを使う', () => {
  const structures = getDamageCalculatorThreeStructures()
  assert.deepEqual(structures.map(value => value.basicInfo.operatorName), ['スルト', 'スカジ'])
  assert.equal(structures[0], findSkillStructure(DAMAGE_CALCULATOR_THREE_SELECTIONS[0]))
  assert.equal(structures[1], findSkillStructure(DAMAGE_CALCULATOR_THREE_SELECTIONS[1]))
})

test('スルトS2の対象入力を効果の条件式から抽出し、上限2体と実際の対象数を区別する', () => {
  const [structure] = getDamageCalculatorThreeStructures()
  assert.equal(structure.effectStructure.inputRequirements, undefined)
  assert.deepEqual(getDamageCalculatorThreeInputs(structure), [{
    metric: 'actualAttackTargetCount', label: '実際の攻撃対象数', min: 1, max: 2, defaultValue: 1,
  }])
  assert.deepEqual(getDamageCalculatorThreeInputs(getDamageCalculatorThreeStructures()[1]), [])
  const result = output()
  assert.equal(result.actualTargetCount, 1)
  assert.equal(result.maxTargetCount, 2)
})

test('スルトS2単体時: 攻撃力120%加算の後で1.6倍し、術属性・DPSへ反映する', () => {
  const result = output()
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.stats.attack, 772)
  assert.equal(result.damageType, 'ARTS')
  assert.equal(result.axisLabel, '敵の術耐性')
  assert.equal(result.model?.directMultiplierPercent, 120)
  assert.equal(result.model?.attackScalePercent, 160)
  const row = result.rows[0]
  assert.equal(row.breakdown.attackPipeline.afterDirectMultiplier, 1698.4)
  assert.equal(row.breakdown.attackPipeline.afterFinalMultiplier, 1698)
  close(row.perAttack, 2716.8)
  close(row.dps, 2173.44)
  close(row.allTargetsPerAttack, row.perAttack)
  close(row.allTargetsDps, row.dps!)
  assert.equal(result.effects.find(entry => entry.effect.id === 'single_target')?.applied, true)
})

test('スルトS2二体時: 単体倍率を除き、対象ごとの術耐性軽減後に二体分を合計する', () => {
  const result = output(record(), { conditions: { actualAttackTargetCount: 2 } })
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.model?.attackScalePercent, 100)
  const row = result.rows.find(entry => entry.axisValue === 60)!
  close(row.perAttack, 679.2)
  close(row.dps, 543.36)
  close(row.allTargetsPerAttack, 1358.4)
  close(row.allTargetsDps, 1086.72)
  const conditional = result.effects.find(entry => entry.effect.id === 'single_target')!
  assert.equal(conditional.applied, false)
  assert.equal(conditional.status, 'CONDITION_FALSE')
  assert.match(conditional.reason, /条件不成立/)
})

test('スカジS1: 攻撃力・攻撃速度を同じ共通処理で適用し、途中で間隔を丸めない', () => {
  const result = output(record(1))
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.stats.attack, 1095)
  assert.equal(result.damageType, 'PHYSICAL')
  assert.equal(result.attackSpeed, 145)
  assert.equal(result.model?.attackInterval, 150 / 145)
  assert.equal(result.effectiveAttack, 1587)
  close(result.rows[0].dps, 1587 * 145 / 150)
  const armor = result.rows.find(entry => entry.axisValue === 1000)!
  assert.equal(armor.perAttack, 587)
  close(armor.dps, 587 * 145 / 150)
  close(result.rows.at(-1)?.perAttack, 1587 * 0.05)
  assert.ok(result.rows.every(row => row.perAttack === row.allTargetsPerAttack && row.dps === row.allTargetsDps))
})

test('育成と信頼は変更でき、素質・潜在・MODの補正は計算へ混入しない', () => {
  const skill = record()
  const before = structuredClone(skill)
  const result = output(skill)
  assert.equal(result.stats.baseAttackBreakdown.potentialAttack, 0)
  assert.equal(result.stats.baseAttackBreakdown.moduleAttack, 0)
  assert.equal(result.rows[0].breakdown.mitigation.resistanceIgnoreFixed, 0)
  close(result.rows.find(row => row.axisValue === 20)?.perAttack, 2716.8 * 0.8)
  const low = output(skill, { operatorLevel: 1, trust: 0 })
  assert.equal(low.stats.attack, 544)
  close(low.rows[0].perAttack, Math.floor(544 * 2.2) * 1.6)
  assert.deepEqual(skill, before)
})

test('範囲変更はダメージ・DPSを止めず、退場までの総ダメージを仮定で出さない', () => {
  const result = output()
  const range = result.effects.find(entry => entry.effect.item === 'ATTACK_RANGE')!
  assert.equal(range.applied, false)
  assert.equal(range.status, 'NOT_RELEVANT')
  assert.match(range.reason, /計算には使用しません/)
  assert.ok(result.rows.length > 0)
  assert.ok(result.rows.every(row => row.breakdown.total === null && row.breakdown.totalMode === 'NONE'))
})

test('説明文・blackboardの代表値を再推測せず、登録済み構造の効果を評価する', () => {
  const skill = record()
  skill.skillLevels[9].description = '曖昧な説明'
  skill.skillLevels[9].blackboard = [{ key: 'atk', value: 99 }, { key: 'atk_scale', value: 99 }]
  const result = output(skill)
  assert.deepEqual(result.unsupportedReasons, [])
  assert.equal(result.model?.directMultiplierPercent, 120)
  assert.equal(result.model?.attackScalePercent, 160)
})

test('未対応スキル・未対応レベル・選択キーの不一致を特化3で代用しない', () => {
  const skill = record()
  const invalid = [
    { skillLevelIndex: 8 }, { skillLevelIndex: 9.1 },
    { skill: { ...skill, skillIndex: 3 } },
    { skill: { ...skill, skillId: 'skchr_surtr_3', skillIndex: 3 } },
    { operator: { ...skill, operatorId: 'char_263_skadi' } },
    { skill: { ...skill, skillLevels: [] } },
  ]
  for (const patch of invalid) {
    const result = output(skill, patch)
    assert.ok(result.unsupportedReasons.length > 0, JSON.stringify(patch))
    assert.deepEqual(result.rows, [])
    assert.equal(result.model, null)
    assert.equal(result.effectiveAttack, null)
  }
})

test('対象数の範囲外・小数・非数値を切り詰めて別条件の結果へ置き換えない', () => {
  for (const count of [0, -1, 1.5, 3, NaN, Infinity]) {
    const result = output(record(), { conditions: { actualAttackTargetCount: count } })
    assert.ok(result.unsupportedReasons.some(reason => reason.includes('攻撃対象数')))
    assert.deepEqual(result.rows, [])
  }
  assert.deepEqual(output(record(1), { conditions: { actualAttackTargetCount: 2 } }).rows, [])
})

test('未対応の条件項目はinputRequirements・段階・効果のいずれでも黙殺しない', () => {
  const base = getDamageCalculatorThreeStructures()[0]
  const stage = base.effectStructure.stages[0]
  const variations: SkillStructure[] = [
    { ...base, effectStructure: { ...base.effectStructure, inputRequirements: ['skillActivationCount'] } },
    { ...base, effectStructure: { ...base.effectStructure, stages: [{ ...stage,
      applicability: { metric: 'skillMode', comparison: 'EQ', value: 'INITIAL' } }] } },
    { ...base, effectStructure: { ...base.effectStructure, stages: [{ ...stage,
      effects: [{ ...stage.effects[0], condition: { metric: 'attackDistanceType', comparison: 'EQ', value: 'RANGED' } }] }] } },
  ]
  for (const structure of variations) assert.throws(() => getDamageCalculatorThreeInputs(structure), /まだ対応していません/)
})

test('欠損した基礎攻撃データと不正な育成条件を既定値で計算しない', () => {
  const skill = record()
  const incomplete = structuredClone(skill)
  delete incomplete.operatorProfile.phases[2].attributesKeyFrames![0].data!.baseAttackTime
  delete incomplete.operatorProfile.phases[2].attributesKeyFrames![1].data!.baseAttackTime
  for (const patch of [{ operator: incomplete }, { phaseIndex: 99 }, { operatorLevel: 91 }, { trust: NaN }]) {
    const result = output(skill, patch)
    assert.ok(result.unsupportedReasons.length > 0)
    assert.deepEqual(result.rows, [])
  }
})

test('基礎攻撃データが揃っていても、未昇進のS2と昇進1以下の特化3を計算しない', () => {
  for (const selectionIndex of [0, 1]) {
    const skill = record(selectionIndex)
    // Every promotion has valid numeric data, so failure must come from the
    // shared skill-unlock constraints rather than missing attack attributes.
    for (const phaseIndex of [0, 1]) {
      skill.operatorProfile.phases[phaseIndex] = {
        maxLevel: phaseIndex === 0 ? 50 : 80,
        attributesKeyFrames: [
          { level: 1, data: { atk: 500, baseAttackTime: 1.25, attackSpeed: 100 } },
          { level: phaseIndex === 0 ? 50 : 80, data: { atk: 600, baseAttackTime: 1.25, attackSpeed: 100 } },
        ],
      }
      const result = output(skill, { phaseIndex, operatorLevel: 30 })
      assert.ok(result.unsupportedReasons.includes('選択した昇進段階では、このスキルレベルを使用できません。'))
      assert.equal(result.unsupportedReasons.includes('選択した昇進段階では、このスキルは解放されていません。'),
        selectionIndex === 0 && phaseIndex === 0)
      assert.deepEqual(result.rows, [])
      assert.equal(result.model, null)
    }
    const promoted = output(skill, { phaseIndex: 2, operatorLevel: 1 })
    assert.deepEqual(promoted.unsupportedReasons, [])
    assert.ok(promoted.rows.length > 0)
  }
})

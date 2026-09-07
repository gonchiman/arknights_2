import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySkill } from '../src/lib/classifier.ts'
import { deriveGoldenglowGuideSkills } from '../src/lib/goldenglowGuideSkill.ts'
import { GOLDENGLOW_OPERATOR_ID } from '../src/lib/goldenglowExplosion.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

test('S1〜S3の最終スキルレベルを共通の攻撃力・攻撃間隔計算で求める', () => {
  const rows = [createSkill(3), createSkill(1), createSkill(2)]
  const before = structuredClone(rows)
  const skills = deriveGoldenglowGuideSkills(rows)

  assert.deepEqual(skills.map((skill) => ({
    index: skill.skillIndex,
    name: skill.skillName,
    level: skill.skillLevelLabel,
    attack: skill.effectiveAttack,
    interval: skill.attackInterval,
    duration: skill.duration,
    drones: skill.explosionModel.activeDroneCount,
  })), [
    { index: 1, name: 'テストS1', level: '特化3', attack: 547, interval: 0.867, duration: 25, drones: 2 },
    { index: 2, name: 'テストS2', level: '特化3', attack: 625, interval: 1.3, duration: null, drones: 2 },
    { index: 3, name: 'テストS3', level: '特化3', attack: 703, interval: 1.3, duration: 30, drones: 3 },
  ])
  for (const [index, skill] of skills.entries()) {
    const calculation = skill.attackCalculation
    assert.equal(calculation.level, 90)
    assert.deepEqual(calculation.base, {
      levelAttack: 341,
      trustAttack: 50,
      potentialAttack: 0,
      moduleAttack: 0,
      beforeRounding: 391,
      result: 391,
    })
    assert.equal(calculation.skillBonusPercent, [40, 60, 80][index])
    assert.equal(calculation.passiveBonusPercent, 0)
    assert.equal(calculation.pipeline.baseAttack, calculation.base.result)
    assert.equal(calculation.pipeline.directAddition, 0)
    assert.ok(Math.abs(calculation.pipeline.afterDirectMultiplier - [547.4, 625.6, 703.8][index]) < 1e-10)
    assert.equal(calculation.pipeline.afterFinalMultiplier, skill.effectiveAttack)
  }
  assert.equal(skills[0].skillDescription, '攻撃力+40%、攻撃速度+50')
  assert.deepEqual(rows, before)
})

test('名前・補正・継続時間をゲームデータから読み、浮遊ユニット倍率を爆発の攻撃力に重ねない', () => {
  const row = createSkill(1)
  const level = row.skillLevels.at(-1)!
  level.name = 'データから読み込む名前'
  level.duration = 17
  level.blackboard = [
    { key: 'atk', value: 0.25 },
    { key: 'attack_speed', value: 0 },
    { key: 'attack@cnt', value: 2 },
    { key: 'attack@atk_scale', value: 9 },
  ]
  const [skill] = deriveGoldenglowGuideSkills([row])
  assert.equal(skill.skillName, 'データから読み込む名前')
  assert.equal(skill.effectiveAttack, 488)
  assert.equal(skill.attackInterval, 1.3)
  assert.equal(skill.duration, 17)
  assert.equal(skill.explosionModel.activeDroneCount, 3)
  assert.equal(skill.attackCalculation.skillBonusPercent, 25)
  assert.equal(skill.attackCalculation.pipeline.directMultiplierPercent, 25)
  assert.equal(skill.attackCalculation.pipeline.afterDirectMultiplier, 488.75)
  assert.equal(skill.attackCalculation.pipeline.afterFinalMultiplier, 488)
})

test('潜在強化・モジュールを適用せず、昇進2の最大レベルと信頼度100を使う', () => {
  const row = createSkill(3)
  row.operatorProfile.phases[2].attributesKeyFrames![1].data!.atk = 400
  const [skill] = deriveGoldenglowGuideSkills([row])
  assert.equal(skill.effectiveAttack, 810)
  assert.equal(skill.explosionModel.attackScale, 3)
  assert.equal(skill.explosionModel.resistanceIgnoreFixed, 15)
  assert.equal(skill.attackCalculation.base.levelAttack, 400)
  assert.equal(skill.attackCalculation.base.result, 450)
  assert.equal(skill.attackCalculation.pipeline.baseAttack, 450)
  assert.equal(skill.attackCalculation.pipeline.afterFinalMultiplier, 810)
})

test('レベル・信頼度・スキル倍率を変更しても攻撃力の詳細が同じ計算結果を示す', () => {
  const row = createSkill(3)
  row.operatorProfile.phases[2].maxLevel = 80
  row.operatorProfile.phases[2].attributesKeyFrames![1].level = 80
  row.operatorProfile.phases[2].attributesKeyFrames![1].data!.atk = 375
  row.operatorProfile.favorKeyFrames[1].data!.atk = 65
  row.skillLevels.at(-1)!.blackboard!.find((entry) => entry.key === 'atk')!.value = 0.55

  const [skill] = deriveGoldenglowGuideSkills([row])
  assert.equal(skill.attackCalculation.level, 80)
  assert.equal(skill.attackCalculation.base.levelAttack, 375)
  assert.equal(skill.attackCalculation.base.trustAttack, 65)
  assert.equal(skill.attackCalculation.base.result, 440)
  assert.ok(Math.abs(skill.attackCalculation.skillBonusPercent - 55) < 1e-10)
  assert.equal(skill.attackCalculation.pipeline.baseAttack, 440)
  assert.equal(skill.attackCalculation.pipeline.afterDirectMultiplier, 682)
  assert.equal(skill.attackCalculation.pipeline.afterFinalMultiplier, 682)
  assert.equal(skill.effectiveAttack, 682)
})

test('対象外のオペレーターや不足・不正なデータに架空の初期値を補わない', () => {
  const missingE2 = createSkill(1)
  missingE2.operatorProfile.phases = []
  const missingLevel = createSkill(1)
  missingLevel.skillLevels = []
  const missingTalent = createSkill(1)
  missingTalent.operatorProfile.talents = []
  const missingAttack = createSkill(1)
  missingAttack.skillLevels.at(-1)!.blackboard = [{ key: 'attack@cnt', value: 1 }]
  const invalidDuration = createSkill(3)
  invalidDuration.skillLevels.at(-1)!.duration = Infinity
  const invalidSpeed = createSkill(1)
  invalidSpeed.skillLevels.at(-1)!.blackboard!.push({ key: 'attack_speed', value: NaN })
  const invalidS2Window = createSkill(2)
  invalidS2Window.classification.effectWindow.value = 'UNKNOWN'
  const unrelated = { ...createSkill(1), operatorId: 'char_other' }
  assert.deepEqual(deriveGoldenglowGuideSkills([]), [])
  assert.deepEqual(deriveGoldenglowGuideSkills([
    missingE2, missingLevel, missingTalent, missingAttack, invalidDuration, invalidSpeed, invalidS2Window, unrelated,
  ]), [])
  assert.equal(deriveGoldenglowGuideSkills([unrelated, missingE2, createSkill(3)]).length, 1)
})

function createSkill(skillIndex: number): SkillRecord {
  const level: RawSkillLevel = {
    name: `テストS${skillIndex}`,
    description: skillIndex === 2
      ? '攻撃力+{atk:0%}、退場まで効果継続'
      : '攻撃力+<@ba.vup>{atk:0%}</>、攻撃速度+{attack_speed:0}',
    duration: skillIndex === 1 ? 25 : skillIndex === 2 ? -1 : 30,
    durationType: 'NONE',
    skillType: 'MANUAL',
    blackboard: [
      { key: 'atk', value: skillIndex === 1 ? 0.4 : skillIndex === 2 ? 0.6 : 0.8 },
      { key: 'attack_speed', value: skillIndex === 1 ? 50 : 0 },
      { key: 'attack@cnt', value: skillIndex === 3 ? 2 : 1 },
    ],
  }
  return {
    id: `${GOLDENGLOW_OPERATOR_ID}:test_${skillIndex}`,
    operatorId: GOLDENGLOW_OPERATOR_ID,
    operatorName: 'ゴールデングロー',
    profession: 'CASTER',
    professionLabel: '術師',
    subProfessionId: 'funnel',
    subProfessionName: '操機術師',
    nameInitial: 'K_ROW',
    rarity: 6,
    skillIndex,
    skillId: `test_${skillIndex}`,
    skillName: '古いスキル名',
    description: '',
    duration: level.duration!,
    durationType: 'NONE',
    skillType: 'MANUAL',
    spType: 'INCREASE_WITH_TIME',
    initSp: 0,
    spCost: 30,
    classification: classifySkill(level),
    skillLevels: [...Array.from({ length: 9 }, () => ({ ...level, duration: 1, blackboard: [] })), level],
    operatorProfile: createProfile(),
    raw: { name: '古いレベル', duration: 1 },
  }
}

function createProfile(): OperatorCombatProfile {
  return {
    phases: [
      { maxLevel: 50, attributesKeyFrames: [{ level: 50, data: { atk: 100 } }] },
      { maxLevel: 80, attributesKeyFrames: [{ level: 80, data: { atk: 200 } }] },
      { maxLevel: 90, attributesKeyFrames: [
        { level: 1, data: { atk: 200, attackSpeed: 100, baseAttackTime: 1.3 } },
        { level: 90, data: { atk: 341, attackSpeed: 100, baseAttackTime: 1.3 } },
      ] },
    ],
    favorKeyFrames: [{ level: 0, data: { atk: 0 } }, { level: 100, data: { atk: 50 } }],
    talents: [
      { candidates: [3, 3.3].map((scale, index) => ({
        name: '爆発の素質',
        description: 'スキル中10%の確率で爆発',
        unlockCondition: { phase: 'PHASE_2', level: 1 },
        requiredPotentialRank: index * 4,
        blackboard: [
          { key: 'attack@atk_scale_2', value: scale },
          { key: 'attack@prob', value: 0.015 },
          { key: 'attack@max_stack_cnt', value: 40 },
        ],
      })) },
      { candidates: [{
        name: '術耐性無視の素質',
        unlockCondition: { phase: 'PHASE_2', level: 1 },
        requiredPotentialRank: 0,
        blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 15 }],
      }] },
    ],
    potentialRanks: [{
      buff: { attributes: { attributeModifiers: [{ attributeType: 'ATK', formulaItem: 'ADDITION', value: 22 }] } },
    }],
    modules: [{
      uniEquipId: 'unused_module',
      phases: [{ equipLevel: 3, attributeBlackboard: [{ key: 'atk', value: 100 }] }],
    }],
  }
}

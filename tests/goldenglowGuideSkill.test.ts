import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySkill } from '../src/lib/classifier.ts'
import { deriveGoldenglowGuideSkills } from '../src/lib/goldenglowGuideSkill.ts'
import { calculateGoldenglowExplosionDamage, GOLDENGLOW_OPERATOR_ID } from '../src/lib/goldenglowExplosion.ts'
import { buildGoldenglowCombinedAttackTable } from '../src/lib/goldenglowCombinedAttackTable.ts'
import { buildGoldenglowNormalAttackTable } from '../src/lib/goldenglowNormalAttackTable.ts'
import type { OperatorCombatProfile, RawOperatorModule, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

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
    assert.equal(skill.skillLevelIndex, 9)
    assert.equal(skill.skillLevelCount, 10)
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

test('Lv1〜7・特化1〜3を選択して補正・攻撃間隔・継続時間・説明・浮遊ユニット数を更新する', () => {
  const row = createSelectableS1()
  const before = structuredClone(row)
  const expected = [
    { label: 'Lv.1', attack: 430, interval: 1.182, duration: 15, drones: 1, description: '攻撃力+10%、攻撃速度+10' },
    { label: 'Lv.2', attack: 437, interval: 1.161, duration: 16, drones: 2, description: '攻撃力+12%、攻撃速度+12' },
    { label: 'Lv.3', attack: 445, interval: 1.13, duration: 17, drones: 2, description: '攻撃力+14%、攻撃速度+15' },
    { label: 'Lv.4', attack: 453, interval: 1.102, duration: 18, drones: 2, description: '攻撃力+16%、攻撃速度+18' },
    { label: 'Lv.5', attack: 461, interval: 1.083, duration: 19, drones: 2, description: '攻撃力+18%、攻撃速度+20' },
    { label: 'Lv.6', attack: 469, interval: 1.04, duration: 20, drones: 2, description: '攻撃力+20%、攻撃速度+25' },
    { label: 'Lv.7', attack: 488, interval: 1, duration: 20, drones: 2, description: '攻撃力+25%、攻撃速度+30' },
    { label: '特化1', attack: 508, interval: 0.963, duration: 21, drones: 2, description: '攻撃力+30%、攻撃速度+35' },
    { label: '特化2', attack: 527, interval: 0.929, duration: 23, drones: 2, description: '攻撃力+35%、攻撃速度+40' },
    { label: '特化3', attack: 547, interval: 0.867, duration: 25, drones: 2, description: '攻撃力+40%、攻撃速度+50' },
  ]

  for (const [index, entry] of expected.entries()) {
    const [skill] = deriveGoldenglowGuideSkills([row], '', 3, index)
    assert.equal(skill.skillLevelIndex, index)
    assert.equal(skill.skillLevelCount, 10)
    assert.deepEqual({
      label: skill.skillLevelLabel,
      attack: skill.effectiveAttack,
      interval: skill.attackInterval,
      duration: skill.duration,
      drones: skill.explosionModel.activeDroneCount,
      description: skill.skillDescription,
    }, entry)
    assert.equal(skill.attackCalculation.pipeline.afterFinalMultiplier, entry.attack)
  }
  assert.deepEqual(deriveGoldenglowGuideSkills([row]), deriveGoldenglowGuideSkills([row], '', 3, 9))
  assert.deepEqual(row, before)
})

test('S2は選択レベルでも永続を維持し、S3の選択レベルの時間と浮遊ユニット数を使う', () => {
  const s2 = createSkill(2)
  const s3 = createSkill(3)
  for (const row of [s2, s3]) {
    row.skillLevels = Array.from({ length: 10 }, () => structuredClone(row.skillLevels.at(-1)!))
  }
  s2.skillLevels[0].blackboard![0].value = 0.2
  s2.skillLevels[7].blackboard![0].value = 0.5
  s3.skillLevels[0].blackboard![0].value = 0.4
  s3.skillLevels[0].blackboard![2].value = 1
  s3.skillLevels[0].duration = 20
  s3.skillLevels[7].blackboard![0].value = 0.7
  s3.skillLevels[7].duration = 27

  for (const [index, expected] of [
    [0, [{ attack: 469, duration: null, drones: 2 }, { attack: 547, duration: 20, drones: 2 }]],
    [7, [{ attack: 586, duration: null, drones: 2 }, { attack: 664, duration: 27, drones: 3 }]],
  ] as const) {
    assert.deepEqual(deriveGoldenglowGuideSkills([s2, s3], '', 3, index).map((skill) => ({
      attack: skill.effectiveAttack,
      duration: skill.duration,
      drones: skill.explosionModel.activeDroneCount,
    })), expected)
  }
})

test('選択スキルレベルとモジュールLv1〜3を組み合わせて攻撃力と攻撃速度を計算する', () => {
  const row = createSelectableS1()
  row.operatorProfile.modules = [createGuideModule()]
  const before = structuredClone(row)
  const cases = [
    { index: 0, level: 1, attack: 452, interval: 1.14, explosion: 3, ignore: 15 },
    { index: 0, level: 2, attack: 468, interval: 1.121, explosion: 3.4, ignore: 18 },
    { index: 0, level: 3, attack: 485, interval: 1.102, explosion: 3.6, ignore: 20 },
    { index: 7, level: 1, attack: 534, interval: 0.935, explosion: 3, ignore: 15 },
    { index: 7, level: 2, attack: 553, interval: 0.922, explosion: 3.4, ignore: 18 },
    { index: 7, level: 3, attack: 573, interval: 0.909, explosion: 3.6, ignore: 20 },
  ]
  for (const entry of cases) {
    const [skill] = deriveGoldenglowGuideSkills([row], 'guide_module', entry.level, entry.index)
    assert.equal(skill.skillLevelIndex, entry.index)
    assert.equal(skill.moduleApplication.moduleLevel, entry.level)
    assert.equal(skill.effectiveAttack, entry.attack)
    assert.equal(skill.attackInterval, entry.interval)
    assert.equal(skill.explosionModel.attackScale, entry.explosion)
    assert.equal(skill.explosionModel.resistanceIgnoreFixed, entry.ignore)
    assert.equal(skill.explosionModel.activeDroneCount, entry.index === 0 ? 1 : 2)
    assert.equal(skill.attackCalculation.pipeline.afterFinalMultiplier, entry.attack)
  }
  row.skillLevels[0].blackboard!.push({ key: 'base_attack_time', value: 0.2 })
  assert.equal(deriveGoldenglowGuideSkills([row], 'guide_module', 1, 0)[0].attackInterval, 1.316)
  row.skillLevels[0].blackboard!.pop()
  assert.deepEqual(row, before)
})

test('選択レベルの不正値・不足データを最終レベルや初期値で置き換えない', () => {
  const row = createSelectableS1()
  for (const index of [-1, 10, 0.5, NaN, Infinity]) {
    assert.deepEqual(deriveGoldenglowGuideSkills([row], '', 3, index), [])
  }
  const missingAttack = structuredClone(row)
  missingAttack.skillLevels[0].blackboard = [{ key: 'attack@cnt', value: 1 }]
  const invalidSpeed = structuredClone(row)
  invalidSpeed.skillLevels[0].blackboard![1].value = NaN
  const invalidDuration = structuredClone(row)
  invalidDuration.skillLevels[0].duration = Infinity
  const invalidS2Window = createSkill(2)
  invalidS2Window.skillLevels[0] = structuredClone(invalidS2Window.skillLevels.at(-1)!)
  invalidS2Window.skillLevels[0].duration = 20
  assert.deepEqual(deriveGoldenglowGuideSkills([
    missingAttack, invalidSpeed, invalidDuration, invalidS2Window,
  ], '', 3, 0), [])
  assert.equal(deriveGoldenglowGuideSkills([missingAttack, invalidSpeed, invalidDuration, invalidS2Window]).length, 4)
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

test('選択モジュールのLv1〜3で基礎攻撃力と攻撃速度を更新してS1〜S3へ反映する', () => {
  const rows = [1, 2, 3].map((index) => {
    const row = createSkill(index)
    row.operatorProfile.modules = [createGuideModule()]
    return row
  })
  const before = structuredClone(rows)
  const expected = [
    { level: 1, moduleAttack: 20, attack: 411, speed: 104, skills: [575, 657, 739], intervals: [0.844, 1.25, 1.25] },
    { level: 2, moduleAttack: 35, attack: 426, speed: 106, skills: [596, 681, 766], intervals: [0.833, 1.226, 1.226] },
    { level: 3, moduleAttack: 50, attack: 441, speed: 108, skills: [617, 705, 793], intervals: [0.823, 1.204, 1.204] },
  ]

  for (const entry of expected) {
    const skills = deriveGoldenglowGuideSkills(rows, 'guide_module', entry.level)
    assert.deepEqual(skills.map((skill) => skill.effectiveAttack), entry.skills)
    assert.deepEqual(skills.map((skill) => skill.attackInterval), entry.intervals)
    for (const skill of skills) {
      assert.equal(skill.moduleId, 'guide_module')
      assert.equal(skill.moduleApplication.moduleName, 'ガイド用モジュール')
      assert.equal(skill.moduleApplication.moduleLevel, entry.level)
      assert.equal(skill.operatorStats.attack, entry.attack)
      assert.equal(skill.operatorStats.attackSpeed, entry.speed)
      assert.equal(skill.operatorStats.attackInterval, 130 / entry.speed)
      assert.equal(skill.attackCalculation.base.moduleAttack, entry.moduleAttack)
      assert.equal(skill.attackCalculation.base.potentialAttack, 0)
      assert.equal(skill.attackCalculation.base.result, skill.operatorStats.attack)
      assert.equal(skill.passives, skill.moduleApplication.passives)
    }
  }
  assert.deepEqual(deriveGoldenglowGuideSkills(rows, 'guide_module'), deriveGoldenglowGuideSkills(rows, 'guide_module', 3))
  assert.deepEqual(rows, before)
})

test('モジュールの特性・素質変更を爆発倍率・PRD・浮遊ユニット倍率・術耐性無視へ反映する', () => {
  const row = createSkill(3)
  row.operatorProfile.modules = [createGuideModule()]
  const before = structuredClone(row)
  const skills = [1, 2, 3].map((level) => deriveGoldenglowGuideSkills([row], 'guide_module', level)[0])

  assert.deepEqual(skills.map((skill) => ({
    scale: skill.explosionModel.attackScale,
    step: skill.explosionModel.prdStep,
    maxStack: skill.explosionModel.prdMaxStack,
    resistanceIgnore: skill.explosionModel.resistanceIgnoreFixed,
    initialScale: skill.explosionModel.droneInitialAttackScale,
    scaleStep: skill.explosionModel.droneAttackScaleStep,
    maxScale: skill.explosionModel.droneMaxAttackScale,
    rampStack: skill.explosionModel.droneMaxStack,
  })), [
    { scale: 3, step: 0.015, maxStack: 40, resistanceIgnore: 15, initialScale: 0.3, scaleStep: 0.2, maxScale: 1.5, rampStack: 6 },
    { scale: 3.4, step: 0.02, maxStack: 30, resistanceIgnore: 18, initialScale: 0.3, scaleStep: 0.2, maxScale: 1.5, rampStack: 6 },
    { scale: 3.6, step: 0.025, maxStack: 20, resistanceIgnore: 20, initialScale: 0.3, scaleStep: 0.2, maxScale: 1.5, rampStack: 6 },
  ])
  assert.equal(skills[2].passives.traitDescription, '浮遊ユニットの攻撃倍率を強化')
  assert.equal(skills[2].passives.talents[0].description, 'スキル中10%の確率で爆発、倍率360%')
  assert.equal(skills[2].passives.talents[1].description, '術耐性を20無視')
  assert.equal(skills[2].explosionModel.talentDescription, skills[2].passives.talents[0].description)
  assert.deepEqual(row, before)
})

test('モジュールを切り替えられ、未選択・対象外・未解放では従来の基礎値を維持する', () => {
  const row = createSkill(1)
  const alternate = createGuideModule()
  alternate.uniEquipId = 'alternate_module'
  alternate.uniEquipName = '別のモジュール'
  alternate.phases![2].attributeBlackboard = { atk: 100, attack_speed: 25 }
  const initial = { ...createGuideModule(), uniEquipId: 'initial_module', type: 'INITIAL' }
  const locked = { ...createGuideModule(), uniEquipId: 'locked_module', unlockLevel: 100 }
  row.operatorProfile.modules = [createGuideModule(), alternate, initial, locked]
  const before = structuredClone(row)
  const [base] = deriveGoldenglowGuideSkills([row])
  const [selected] = deriveGoldenglowGuideSkills([row], 'alternate_module')

  assert.equal(base.operatorStats.attack, 391)
  assert.equal(base.operatorStats.attackSpeed, 100)
  assert.equal(base.moduleId, '')
  assert.equal(base.moduleApplication.moduleLevel, 0)
  assert.equal(selected.operatorStats.attack, 491)
  assert.equal(selected.operatorStats.attackSpeed, 125)
  assert.equal(selected.effectiveAttack, 687)
  assert.equal(selected.attackInterval, 0.743)
  assert.equal(selected.moduleApplication.moduleName, '別のモジュール')
  for (const id of ['', 'unknown_module', 'initial_module', 'locked_module']) {
    assert.deepEqual(deriveGoldenglowGuideSkills([row], id), [base])
  }
  assert.deepEqual(row, before)
})

test('MOD1・MOD2の全Lvで通常攻撃と合算表へ攻撃力・間隔・倍率・術耐性無視を引き継ぐ', () => {
  const modules: RawOperatorModule[] = [
    {
      uniEquipId: 'mod1', uniEquipName: 'MOD1', type: 'ADVANCED',
      phases: [1, 2, 3].map((level, index) => ({
        equipLevel: level,
        attributeBlackboard: { atk: [22, 32, 38][index] },
        parts: [
          { overrideTraitDataBundle: { candidates: [{
            blackboard: { init_atk_scale: 0.35, delta_atk_scale: 0.15, max_atk_scale: 1.1, max_stack_cnt: 5 },
          }] } },
          { addOrOverrideTalentDataBundle: { candidates: [{
            talentIndex: 0,
            blackboard: { 'attack@atk_scale_2': [3, 3.4, 3.6][index] },
          }] } },
        ],
      })),
    },
    {
      uniEquipId: 'mod2', uniEquipName: 'MOD2', type: 'ADVANCED',
      phases: [1, 2, 3].map((level, index) => ({
        equipLevel: level,
        attributeBlackboard: { atk: [30, 40, 45][index], attack_speed: [5, 6, 7][index] },
        parts: [
          { overrideTraitDataBundle: { candidates: [{
            blackboard: { init_atk_scale: 0.2, delta_atk_scale: 0.15, max_atk_scale: 1.2, max_stack_cnt: 7 },
          }] } },
          { addOrOverrideTalentDataBundle: { candidates: [{
            talentIndex: 1,
            blackboard: { magic_resist_penetrate_fixed: [15, 18, 20][index] },
          }] } },
        ],
      })),
    },
  ]
  const rows = [1, 2, 3].map((index) => {
    const row = createSkill(index)
    row.operatorProfile.modules = modules
    return row
  })
  const cases = [
    { moduleId: 'mod1', level: 1, attacks: [578, 660, 743], intervals: [0.867, 1.3, 1.3], initial: 0.35, cap: 1.1, stack: 5, explosion: 3, ignore: 15 },
    { moduleId: 'mod1', level: 2, attacks: [592, 676, 761], intervals: [0.867, 1.3, 1.3], initial: 0.35, cap: 1.1, stack: 5, explosion: 3.4, ignore: 15 },
    { moduleId: 'mod1', level: 3, attacks: [600, 686, 772], intervals: [0.867, 1.3, 1.3], initial: 0.35, cap: 1.1, stack: 5, explosion: 3.6, ignore: 15 },
    { moduleId: 'mod2', level: 1, attacks: [589, 673, 757], intervals: [0.839, 1.238, 1.238], initial: 0.2, cap: 1.2, stack: 7, explosion: 3, ignore: 15 },
    { moduleId: 'mod2', level: 2, attacks: [603, 689, 775], intervals: [0.833, 1.226, 1.226], initial: 0.2, cap: 1.2, stack: 7, explosion: 3, ignore: 18 },
    { moduleId: 'mod2', level: 3, attacks: [610, 697, 784], intervals: [0.828, 1.215, 1.215], initial: 0.2, cap: 1.2, stack: 7, explosion: 3, ignore: 20 },
  ]

  for (const expected of cases) {
    const skills = deriveGoldenglowGuideSkills(rows, expected.moduleId, expected.level)
    assert.deepEqual(skills.map((skill) => skill.effectiveAttack), expected.attacks)
    assert.deepEqual(skills.map((skill) => skill.attackInterval), expected.intervals)
    for (const [index, skill] of skills.entries()) {
      const input = {
        model: skill.explosionModel,
        attack: skill.effectiveAttack,
        attackInterval: skill.attackInterval,
        duration: skill.duration ?? 30,
        resistance: 60,
        resistanceIgnore: skill.explosionModel.resistanceIgnoreFixed,
      }
      const mitigation = (100 - (60 - expected.ignore)) / 100
      const normal = buildGoldenglowNormalAttackTable(input)
      const explosion = calculateGoldenglowExplosionDamage(input.attack, 0, 60, skill.explosionModel)
      const combined = buildGoldenglowCombinedAttackTable({
        ...input,
        skillIndex: skill.skillIndex,
        explosionDamage: explosion.damageAfterMitigation,
      })
      const expectedNormal = expected.attacks[index] * expected.initial * mitigation * 0.985
      const expectedExplosion = expected.attacks[index] * expected.explosion * mitigation * 0.015
      const expectedBody = skill.skillIndex === 3 ? 0 : expected.attacks[index] * mitigation
      const drones = skill.skillIndex === 3 ? 3 : 2

      assert.equal(normal.length, Math.floor(input.duration / expected.intervals[index]))
      assert.equal(normal[0].damage.appliedResistance, 60 - expected.ignore)
      assert.ok(Math.abs(normal[0].expectedNormalDamage - expectedNormal) < 1e-9)
      assert.ok(Math.abs(normal[expected.stack].attackScalePercent - expected.cap * 100) < 1e-9)
      assert.equal(combined.length, normal.length)
      assert.deepEqual(combined.map((row) => row.normalAttack), normal)
      assert.ok(Math.abs(combined[0].expectedExplosionDamage - expectedExplosion * drones) < 1e-9)
      assert.ok(Math.abs(combined[0].expectedTotalDamage - (expectedBody + (expectedNormal + expectedExplosion) * drones)) < 1e-9)
    }
  }
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

function createSelectableS1(): SkillRecord {
  const row = createSkill(1)
  const finalLevel = row.skillLevels.at(-1)!
  row.skillLevels = [0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4].map((attack, index) => ({
    ...structuredClone(finalLevel),
    duration: [15, 16, 17, 18, 19, 20, 20, 21, 23, 25][index],
    blackboard: [
      { key: 'atk', value: attack },
      { key: 'attack_speed', value: [10, 12, 15, 18, 20, 25, 30, 35, 40, 50][index] },
      { key: 'attack@cnt', value: index === 0 ? 0 : 1 },
    ],
  }))
  return row
}

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

function createGuideModule(): RawOperatorModule {
  return {
    uniEquipId: 'guide_module',
    uniEquipName: 'ガイド用モジュール',
    type: 'ADVANCED',
    unlockEvolvePhase: 'PHASE_2',
    unlockLevel: 60,
    phases: [1, 2, 3].map((level, index) => ({
      equipLevel: level,
      attributeBlackboard: { atk: [20, 35, 50][index], attack_speed: [4, 6, 8][index] },
      parts: [
        { overrideTraitDataBundle: { candidates: [{
          requiredPotentialRank: 0,
          overrideDescription: '浮遊ユニットの攻撃倍率を強化',
          blackboard: { init_atk_scale: 0.3, delta_atk_scale: 0.2, max_atk_scale: 1.5, max_stack_cnt: 6 },
        }] } },
        { addOrOverrideTalentDataBundle: { candidates: [
          {
            talentIndex: 0,
            requiredPotentialRank: 0,
            upgradeDescription: 'スキル中10%の確率で爆発、倍率{attack@atk_scale_2:0%}',
            blackboard: {
              'attack@atk_scale_2': [3, 3.4, 3.6][index],
              'attack@prob': [0.015, 0.02, 0.025][index],
              'attack@max_stack_cnt': [40, 30, 20][index],
            },
          },
          {
            talentIndex: 0,
            requiredPotentialRank: 4,
            upgradeDescription: '潜在強化後の爆発',
            blackboard: { 'attack@atk_scale_2': 9 },
          },
        ] } },
        { addOrOverrideTalentDataBundle: { candidates: [{
          talentIndex: 1,
          requiredPotentialRank: 0,
          upgradeDescription: '術耐性を{magic_resist_penetrate_fixed:0}無視',
          blackboard: { magic_resist_penetrate_fixed: [15, 18, 20][index] },
        }] } },
      ],
    })),
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

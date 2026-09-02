import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildComparisonAxisSeries,
  buildOperatorBuildComparisonCsv,
  buildOperatorBuildComparisonSeriesCsv,
  evaluateComparisonBuild,
  getComparisonAxisForDamageType,
  getComparisonInitialAxis,
  getComparisonMetricValue,
  type ComparisonBuildConfig,
} from '../src/lib/operatorBuildComparison.ts'
import type {
  EffectWindowType,
  RawOperatorModule,
  SkillRecord,
} from '../src/types/skill.ts'

test('同じオペレーターを別slotIdで登録し、モジュール差を独立して計算する', () => {
  const skill = createSkill({ module: createAttackModule() })
  const withoutModule = evaluateComparisonBuild(
    [skill],
    createConfig(skill, { slotId: 'baseline' }),
    { defense: 50, resistance: 0 },
  )
  const withModule = evaluateComparisonBuild(
    [skill],
    createConfig(skill, {
      slotId: 'module-3',
      moduleId: 'module_alpha',
      moduleLevel: 3,
    }),
    { defense: 50, resistance: 0 },
  )

  assert.equal(withoutModule.config.slotId, 'baseline')
  assert.equal(withModule.config.slotId, 'module-3')
  assert.equal(withoutModule.operatorStats.attack, 100)
  assert.equal(withModule.operatorStats.attack, 150)
  assert.equal(withModule.operatorStats.baseAttackBreakdown.moduleAttack, 50)
  assert.equal(withModule.operatorStats.attackSpeed, 120)
  assert.equal(withoutModule.normalOutput.perHit, 50)
  assert.equal(withModule.normalOutput.perHit, 100)
  assert.equal(withModule.skillOutput.perAttack, 200)
  assert.ok(Math.abs((withModule.skillOutput.dps ?? 0) - 200 / 0.833) < 1e-9)
})

test('通常攻撃とスキルでダメージ種別と素質効果を分離する', () => {
  const skill = createSkill({
    operatorId: 'char_350_surtr',
    operatorName: 'スルト',
    profession: 'WARRIOR',
    skillDescription: '敵に物理ダメージを与える',
    traitDescription: '通常攻撃が術ダメージを与える',
  })
  skill.operatorProfile.talents = [{ candidates: [{
    unlockCondition: { phase: 'PHASE_0', level: 1 },
    requiredPotentialRank: 0,
    name: '溶剣',
    description: '攻撃時、対象の術耐性を20無視',
    blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 20 }],
  }] }]

  const result = evaluateComparisonBuild(
    [skill],
    createConfig(skill),
    { defense: 50, resistance: 50 },
  )

  assert.equal(result.normalOutput.damageTypeDetection.damageType, 'ARTS')
  assert.equal(result.skillOutput.damageTypeDetection.damageType, 'PHYSICAL')
  assert.equal(result.normalEffects.modifiers.resistanceIgnoreFixed, 20)
  assert.equal(result.skillEffects.modifiers.resistanceIgnoreFixed, 0)
  assert.equal(result.normalOutput.perHit, 70)
  assert.equal(result.skillOutput.perHit, 50)
})

test('初期横軸をビルド1の選択出力に対応する攻撃属性から決める', () => {
  assert.equal(getComparisonAxisForDamageType('PHYSICAL'), 'DEFENSE')
  assert.equal(getComparisonAxisForDamageType('ARTS'), 'RESISTANCE')
  assert.equal(getComparisonAxisForDamageType('TRUE'), 'DEFENSE')
  assert.equal(getComparisonAxisForDamageType(null), 'DEFENSE')

  const skill = createSkill({
    operatorId: 'char_axis',
    profession: 'WARRIOR',
    skillDescription: '敵に物理ダメージを与える',
    traitDescription: '通常攻撃が術ダメージを与える',
  })
  const config = createConfig(skill)

  assert.equal(getComparisonInitialAxis([skill], config), 'DEFENSE')
  assert.equal(getComparisonInitialAxis([skill], config, 'SKILL_DPS'), 'DEFENSE')
  assert.equal(getComparisonInitialAxis([skill], config, 'NORMAL_PER_HIT'), 'RESISTANCE')
  assert.equal(getComparisonInitialAxis([skill], config, 'NORMAL_DPS'), 'RESISTANCE')

  const artsSkill = createSkill({
    operatorId: 'char_axis_arts',
    profession: 'CASTER',
    skillDescription: '敵に術ダメージを与える',
    traitDescription: '通常攻撃が術ダメージを与える',
  })
  assert.equal(getComparisonInitialAxis([artsSkill], createConfig(artsSkill)), 'RESISTANCE')
})

test('計算対象外スキルは通常攻撃を残し、スキル出力をnullと理由で返す', () => {
  const skill = createSkill({ skillDescription: '味方のHPを回復する' })
  skill.classification.damageComponents.value = ['NO_DIRECT_DAMAGE']
  skill.classification.outputCapabilities.canShowPerHit = false
  skill.classification.outputCapabilities.canShowDps = false
  skill.classification.outputCapabilities.canShowWindowTotal = false

  const result = evaluateComparisonBuild(
    [skill],
    createConfig(skill),
    { defense: 0, resistance: 0 },
  )

  assert.equal(result.normalOutput.perHit, 100)
  assert.equal(result.skillOutput.perHit, null)
  assert.equal(result.skillOutput.dps, null)
  assert.ok(result.skillOutput.unavailableReasons.some((reason) => reason.includes('直接ダメージ')))
  const metric = getComparisonMetricValue(result, 'SKILL_DPS')
  assert.equal(metric.value, null)
  assert.ok(metric.unavailableReasons.length > 0)
})

test('防御力軸では術耐性を固定し、物理と術の系列を同じ点へ重ねる', () => {
  const physical = createSkill({
    operatorId: 'char_physical',
    operatorName: '物理役',
    profession: 'SNIPER',
    skillDescription: '敵に物理ダメージを与える',
  })
  const arts = createSkill({
    operatorId: 'char_arts',
    operatorName: '術役',
    profession: 'CASTER',
    skillDescription: '敵に術ダメージを与える',
    skillId: 'skill_arts',
  })
  const series = buildComparisonAxisSeries(
    [physical, arts],
    [
      createConfig(physical, { slotId: 'physical', colorIndex: 2 }),
      createConfig(arts, { slotId: 'arts', colorIndex: 4 }),
    ],
    { defense: 50, resistance: 50 },
    'DEFENSE',
    'SKILL_PER_HIT',
    [0, 50],
  )

  assert.equal(series.length, 2)
  assert.equal(series[0].slotId, 'physical')
  assert.equal(series[0].colorIndex, 2)
  assert.deepEqual(series[0].points.map((point) => point.value), [100, 50])
  assert.deepEqual(series[1].points.map((point) => point.value), [50, 50])
  assert.equal(series[0].points[1].current, true)
  assert.equal(series[1].points[1].current, true)
})

test('現在値と軸別系列をUTF-8 BOM付きCSVへ出力する', () => {
  const skill = createSkill({ module: createAttackModule() })
  const evaluation = evaluateComparisonBuild(
    [skill],
    createConfig(skill, {
      slotId: 'module',
      label: 'モジュール比較, A',
      moduleId: 'module_alpha',
      moduleLevel: 3,
    }),
    { defense: 50, resistance: 0 },
  )
  const csv = buildOperatorBuildComparisonCsv([evaluation])

  assert.ok(csv.startsWith('\uFEFF'))
  assert.match(csv, /"モジュール比較, A"/)
  assert.match(csv, /"モジュールα Lv\.3"/)
  assert.match(csv, /"100"/)

  const series = buildComparisonAxisSeries(
    [skill],
    [evaluation.config],
    evaluation.enemy,
    'DEFENSE',
    'NORMAL_PER_HIT',
    [0, 50],
  )
  const seriesCsv = buildOperatorBuildComparisonSeriesCsv(series, 'DEFENSE')
  assert.ok(seriesCsv.startsWith('\uFEFF'))
  assert.match(seriesCsv, /"防御力","モジュール比較, A"/)
  assert.match(seriesCsv, /"50","100"/)
})

test('解放条件を満たさないモジュール構成は出力をnullにする', () => {
  const module = createAttackModule()
  module.unlockEvolvePhase = 'PHASE_2'
  module.unlockLevel = 60
  const skill = createSkill({ module })
  const result = evaluateComparisonBuild(
    [skill],
    createConfig(skill, {
      moduleId: 'module_alpha',
      moduleLevel: 3,
      phaseIndex: 0,
      operatorLevel: 1,
    }),
    { defense: 0, resistance: 0 },
  )

  assert.equal(result.normalOutput.perHit, null)
  assert.equal(result.skillOutput.perAttack, null)
  assert.ok(result.unavailableReasons.some((reason) => reason.includes('装備できません')))
})

test('未対応の独立倍率を無視した数値として表示しない', () => {
  const skill = createSkill()
  skill.skillLevels[0].blackboard?.push({ key: 'd_atk_scale', value: 3 })
  const result = evaluateComparisonBuild([skill], createConfig(skill), { defense: 0, resistance: 0 })

  assert.equal(result.skillOutput.perHit, null)
  assert.equal(result.skillOutput.perAttack, null)
  assert.ok(result.skillOutput.unavailableReasons.some((reason) => reason.includes('d_atk_scale')))
})

test('出力capabilityがないDPSと総量は理由付きnullにする', () => {
  const skill = createSkill({ effectWindow: 'AMMO' })
  skill.skillLevels[0].blackboard?.push({ key: 'max_ammo', value: 5 })
  skill.classification.outputCapabilities.canShowDps = false
  skill.classification.outputCapabilities.canShowWindowTotal = false
  const result = evaluateComparisonBuild([skill], createConfig(skill), { defense: 0, resistance: 0 })

  assert.equal(result.skillOutput.dps, null)
  assert.equal(result.skillOutput.total, null)
  assert.ok(getComparisonMetricValue(result, 'SKILL_DPS').unavailableReasons.length > 0)
  assert.ok(getComparisonMetricValue(result, 'SKILL_TOTAL').unavailableReasons.length > 0)
  assert.match(buildOperatorBuildComparisonCsv([result]), /一部出力なし/)
})

test('既定の軸系列へ固定無視と最低保証の折点を追加する', () => {
  const skill = createSkill()
  const series = buildComparisonAxisSeries(
    [skill],
    [createConfig(skill)],
    { defense: 0, resistance: 0 },
    'DEFENSE',
    'NORMAL_PER_HIT',
  )

  assert.ok(series[0].points.some((point) => point.x === 95 && point.value === 5))
})

test('敵防御力が2000を超える表示範囲でも最低保証の折点を追加する', () => {
  const skill = createSkill()
  skill.operatorProfile.phases[0].attributesKeyFrames![0].data!.atk = 3000
  const series = buildComparisonAxisSeries(
    [skill],
    [createConfig(skill)],
    { defense: 5000, resistance: 0 },
    'DEFENSE',
    'NORMAL_PER_HIT',
  )

  assert.ok(series[0].points.some((point) => point.x === 2850 && point.value === 150))
  assert.ok(series[0].points.some((point) => point.x === 5000 && point.current))
})

test('固定無視の折点を既定の軸系列へ追加する', () => {
  const skill = createSkill({
    operatorId: 'char_350_surtr',
    profession: 'CASTER',
    traitDescription: '敵に術ダメージを与える',
  })
  skill.operatorProfile.talents = [{
    candidates: [{
      unlockCondition: { phase: 'PHASE_0', level: 1 },
      requiredPotentialRank: 0,
      name: '劫火',
      description: '攻撃時、対象の術耐性を13無視',
      blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 13 }],
    }],
  }]
  const series = buildComparisonAxisSeries(
    [skill],
    [createConfig(skill)],
    { defense: 5000, resistance: 0 },
    'RESISTANCE',
    'NORMAL_PER_HIT',
  )

  assert.ok(series[0].points.some((point) => point.x === 13 && point.value === 100))
})

test('モジュール違いの系列CSV見出しを一意にする', () => {
  const skill = createSkill({ module: createAttackModule() })
  const series = buildComparisonAxisSeries(
    [skill],
    [
      createConfig(skill, { slotId: 'without' }),
      createConfig(skill, { slotId: 'with', moduleId: 'module_alpha', moduleLevel: 3 }),
    ],
    { defense: 0, resistance: 0 },
    'DEFENSE',
    'NORMAL_PER_HIT',
  )
  const csv = buildOperatorBuildComparisonSeriesCsv(series, 'DEFENSE')

  assert.notEqual(series[0].label, series[1].label)
  assert.match(csv, /モジュールなし/)
  assert.match(csv, /モジュールα Lv\.3/)
})

function createConfig(
  skill: SkillRecord,
  overrides: Partial<ComparisonBuildConfig> = {},
): ComparisonBuildConfig {
  return {
    slotId: 'slot-1',
    label: null,
    colorIndex: 0,
    operatorId: skill.operatorId,
    skillRecordId: skill.id,
    phaseIndex: 0,
    operatorLevel: 1,
    trustPercent: 100,
    skillLevelIndex: 0,
    moduleId: null,
    moduleLevel: null,
    ...overrides,
  }
}

function createAttackModule(): RawOperatorModule {
  return {
    uniEquipId: 'module_alpha',
    uniEquipName: 'モジュールα',
    type: 'ADVANCED',
    unlockEvolvePhase: 'PHASE_0',
    unlockLevel: 1,
    phases: [
      { equipLevel: 1, attributeBlackboard: [{ key: 'atk', value: 20 }] },
      { equipLevel: 2, attributeBlackboard: [{ key: 'atk', value: 35 }] },
      {
        equipLevel: 3,
        attributeBlackboard: [
          { key: 'atk', value: 50 },
          { key: 'attack_speed', value: 20 },
        ],
      },
    ],
  }
}

function createSkill({
  operatorId = 'char_test',
  operatorName = 'テスト',
  profession = 'SNIPER',
  skillId = 'skill_test',
  skillDescription = '敵に物理ダメージを与える',
  traitDescription = '敵に物理ダメージを与える',
  module,
  effectWindow = 'FIXED_DURATION',
}: {
  operatorId?: string
  operatorName?: string
  profession?: string
  skillId?: string
  skillDescription?: string
  traitDescription?: string
  module?: RawOperatorModule
  effectWindow?: EffectWindowType
} = {}): SkillRecord {
  const skillLevel = {
    name: 'テストスキル',
    description: skillDescription,
    duration: effectWindow === 'FIXED_DURATION' ? 10 : -1,
    durationType: effectWindow === 'AMMO' ? 'AMMO' : 'NONE',
    blackboard: [
      { key: 'atk_scale', value: 1 },
      { key: 'attack@times', value: 2 },
    ],
  }
  const canShowDps = effectWindow !== 'NONE' && effectWindow !== 'UNKNOWN'

  return {
    id: `${operatorId}:${skillId}`,
    operatorId,
    operatorName,
    profession,
    professionLabel: profession === 'CASTER' ? '術師' : '狙撃',
    subProfessionId: 'test',
    subProfessionName: 'テスト職分',
    nameInitial: 'T_ROW',
    rarity: 6,
    skillIndex: 1,
    skillId,
    skillName: 'テストスキル',
    description: skillDescription,
    duration: effectWindow === 'FIXED_DURATION' ? 10 : null,
    durationType: effectWindow === 'AMMO' ? 'AMMO' : 'NONE',
    skillType: 'MANUAL',
    spType: 'INCREASE_WITH_TIME',
    initSp: 0,
    spCost: 10,
    classification: {
      effectWindow: { value: effectWindow, confidence: 'HIGH', reasons: [], source: 'AUTO' },
      activationTrigger: { value: 'MANUAL', confidence: 'HIGH', reasons: [], source: 'AUTO' },
      damageComponents: { value: ['BASIC_ATTACK_MODIFIER'], confidence: 'HIGH', reasons: [], source: 'AUTO' },
      conditions: { value: [], confidence: 'HIGH', reasons: [], source: 'AUTO' },
      outputCapabilities: {
        canShowPerHit: true,
        canShowPerActivationTotal: effectWindow === 'NONE',
        canShowDps,
        canShowWindowTotal: effectWindow === 'FIXED_DURATION' || effectWindow === 'AMMO',
        canShowSteadyStateDps: false,
        requiresModeSelection: false,
        requiresManualModel: false,
      },
      requiresManualModelReasons: [],
    },
    skillLevels: [skillLevel],
    operatorProfile: {
      phases: [{
        maxLevel: 1,
        attributesKeyFrames: [{
          level: 1,
          data: { atk: 100, attackSpeed: 100, baseAttackTime: 1 },
        }],
      }],
      favorKeyFrames: [{ level: 0, data: { atk: 0 } }],
      trait: { candidates: [{
        unlockCondition: { phase: 'PHASE_0', level: 1 },
        requiredPotentialRank: 0,
        overrideDescription: traitDescription,
        blackboard: [],
      }] },
      talents: [],
      modules: module ? [module] : [],
      traitDescription,
    },
    raw: skillLevel,
  }
}

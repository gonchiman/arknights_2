import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildComparisonAxisSeries,
  buildOperatorBuildComparisonCsv,
  buildOperatorBuildComparisonSeriesCsv,
  buildOperatorBuildComparisonSeriesTsv,
  evaluateComparisonBuild,
  getComparisonAxisForDamageType,
  getComparisonInitialAxis,
  getComparisonMaximumSkillLevelIndex,
  getComparisonMetricValue,
  getComparisonMinimumPhaseIndex,
  normalizeComparisonBuildConfig,
  retargetComparisonBuildConfigs,
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
  assert.match(seriesCsv, /"防御力","モジュール比較, A ·/)
  assert.match(seriesCsv, /"50","100"/)
})

test('正確な数値の表を数値軸と空セルを保つTSVへ出力する', () => {
  const calculable = createSkill({ operatorId: 'char_calculable' })
  const unavailable = createSkill({
    operatorId: 'char_unavailable',
    operatorName: '非攻撃役',
    skillDescription: '味方のHPを回復する',
  })
  unavailable.classification.damageComponents.value = ['NO_DIRECT_DAMAGE']
  unavailable.classification.outputCapabilities.canShowPerHit = false

  const series = buildComparisonAxisSeries(
    [calculable, unavailable],
    [
      createConfig(calculable, { slotId: 'calculable', label: '=1+1' }),
      createConfig(unavailable, { slotId: 'unavailable' }),
    ],
    { defense: 50, resistance: 0 },
    'DEFENSE',
    'SKILL_PER_HIT',
    [0, 50],
  )
  const tsv = buildOperatorBuildComparisonSeriesTsv(series, 'DEFENSE')
  const lines = tsv.split('\r\n')

  assert.equal(tsv.startsWith('\uFEFF'), false)
  assert.equal(lines[0].split('\t').length, 3)
  assert.equal(lines[1].split('\t').length, 3)
  assert.match(lines[0], /^防御力\t'=1\+1/)
  assert.match(lines[0], /\tBuild B/)
  assert.equal(lines.find((line) => line.startsWith('50\t')), '50\t50\t')
  assert.equal(tsv.includes('（現在）'), false)
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

test('潜在の攻撃力と攻撃速度を比較計算へ反映する', () => {
  const skill = createSkill()
  skill.operatorProfile.potentialRanks = [
    {
      type: 'BUFF',
      description: '攻撃力+20',
      buff: {
        attributes: {
          attributeModifiers: [{
            attributeType: 'ATK',
            formulaItem: 'ADDITION',
            value: 20,
          }],
        },
      },
    },
    {
      type: 'BUFF',
      description: '攻撃速度+10',
      buff: {
        attributes: {
          attributeModifiers: [{
            attributeType: 'ATTACK_SPEED',
            formulaItem: 'ADDITION',
            value: 10,
          }],
        },
      },
    },
  ]

  const baseline = evaluateComparisonBuild([skill], createConfig(skill, { potentialRank: 1 }))
  const maxPotential = evaluateComparisonBuild([skill], createConfig(skill, { potentialRank: 3 }))

  assert.equal(baseline.operatorStats.attack, 100)
  assert.equal(maxPotential.potential.potentialRank, 3)
  assert.equal(maxPotential.operatorStats.baseAttackBreakdown.potentialAttack, 20)
  assert.equal(maxPotential.operatorStats.attack, 120)
  assert.equal(maxPotential.operatorStats.attackSpeed, 110)
  assert.equal(maxPotential.normalOutput.perHit, 120)
  assert.ok((maxPotential.normalOutput.dps ?? 0) > (baseline.normalOutput.dps ?? 0))
  assert.match(buildOperatorBuildComparisonCsv([maxPotential]), /"潜在"/)
  assert.match(buildOperatorBuildComparisonCsv([maxPotential]), /"潜在3"/)
})

test('昇進段階に応じてスキル解放とスキルレベル上限を正規化する', () => {
  const skill = createSkill({ skillIndex: 3, module: createAttackModule() })
  skill.operatorProfile.phases = [
    { maxLevel: 50, attributesKeyFrames: [{ level: 1, data: { atk: 100 } }] },
    { maxLevel: 80, attributesKeyFrames: [{ level: 1, data: { atk: 120 } }] },
    { maxLevel: 90, attributesKeyFrames: [{ level: 1, data: { atk: 140 } }] },
  ]
  skill.operatorProfile.potentialRanks = Array.from({ length: 5 }, () => ({ type: 'CUSTOM' }))
  skill.skillLevels = Array.from({ length: 10 }, (_, index) => ({
    ...skill.raw,
    name: `スキルLv${index + 1}`,
  }))
  const module = skill.operatorProfile.modules?.[0]
  if (module) {
    module.unlockEvolvePhase = 'PHASE_2'
    module.unlockLevel = 60
  }

  assert.equal(getComparisonMinimumPhaseIndex(skill), 2)
  assert.equal(getComparisonMaximumSkillLevelIndex(skill, 0), 3)
  assert.equal(getComparisonMaximumSkillLevelIndex(skill, 1), 6)
  assert.equal(getComparisonMaximumSkillLevelIndex(skill, 2), 9)

  const normalized = normalizeComparisonBuildConfig([skill], createConfig(skill, {
    phaseIndex: -10,
    operatorLevel: 1,
    potentialRank: 99,
    trustPercent: 120,
    skillLevelIndex: 99,
    moduleId: 'module_alpha',
    moduleLevel: 99,
  }))

  assert.equal(normalized.phaseIndex, 2)
  assert.equal(normalized.operatorLevel, 1)
  assert.equal(normalized.potentialRank, 6)
  assert.equal(normalized.trustPercent, 100)
  assert.equal(normalized.skillLevelIndex, 9)
  assert.equal(normalized.moduleId, null)
  assert.equal(normalized.moduleLevel, null)
})

test('比較対象の変更時に全ビルドを同じoperator・skillへ一括retargetする', () => {
  const first = createSkill({ operatorId: 'char_common', skillId: 'skill_1', skillIndex: 1 })
  const target = createSkill({ operatorId: 'char_common', skillId: 'skill_2', skillIndex: 2 })
  const other = createSkill({ operatorId: 'char_other', skillId: 'skill_other', skillIndex: 1 })
  first.operatorProfile.phases = target.operatorProfile.phases = [
    { maxLevel: 50, attributesKeyFrames: [{ level: 1, data: { atk: 100 } }] },
    { maxLevel: 80, attributesKeyFrames: [{ level: 1, data: { atk: 120 } }] },
    { maxLevel: 90, attributesKeyFrames: [{ level: 1, data: { atk: 140 } }] },
  ]
  target.skillLevels = Array.from({ length: 10 }, () => ({ ...target.raw }))

  const configs = [
    createConfig(first, { slotId: 'a', colorIndex: 2, phaseIndex: 0 }),
    createConfig(other, {
      slotId: 'b',
      colorIndex: 4,
      phaseIndex: 2,
      moduleId: 'other-module',
      moduleLevel: 3,
    }),
  ]
  const retargeted = retargetComparisonBuildConfigs(
    [first, target, other],
    configs,
    target.id,
  )

  assert.deepEqual(retargeted.map((config) => config.operatorId), ['char_common', 'char_common'])
  assert.deepEqual(retargeted.map((config) => config.skillRecordId), [target.id, target.id])
  assert.deepEqual(retargeted.map((config) => config.slotId), ['a', 'b'])
  assert.deepEqual(retargeted.map((config) => config.colorIndex), [2, 4])
  assert.equal(retargeted[0].phaseIndex, 1)
  assert.equal(retargeted[0].skillLevelIndex, 0)
  assert.equal(retargeted[1].moduleId, null)
})

test('系列ラベルにビルド名と育成条件を含めて同一対象の差を識別する', () => {
  const skill = createSkill({ module: createAttackModule() })
  const series = buildComparisonAxisSeries(
    [skill],
    [
      createConfig(skill, { slotId: 'a', label: '基準', potentialRank: 1 }),
      createConfig(skill, {
        slotId: 'b',
        label: '比較',
        potentialRank: 1,
        moduleId: 'module_alpha',
        moduleLevel: 2,
      }),
    ],
    { defense: 0, resistance: 0 },
    'DEFENSE',
    'NORMAL_PER_HIT',
  )

  assert.match(series[0].label, /^基準 · テスト · S1 テストスキル · 昇進0 Lv\.1 · 潜在1/)
  assert.match(series[1].label, /^比較 · テスト · S1 テストスキル · 昇進0 Lv\.1 · 潜在1/)
  assert.match(series[1].label, /モジュールα Lv\.2/)
  assert.notEqual(series[0].label, series[1].label)
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
    potentialRank: 1,
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
  skillIndex = 1,
  skillDescription = '敵に物理ダメージを与える',
  traitDescription = '敵に物理ダメージを与える',
  module,
  effectWindow = 'FIXED_DURATION',
}: {
  operatorId?: string
  operatorName?: string
  profession?: string
  skillId?: string
  skillIndex?: number
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
    skillIndex,
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

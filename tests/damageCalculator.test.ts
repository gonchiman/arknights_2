import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateAttackPipeline,
  calculateDamage,
  calculateDamageBreakdown,
  calculateSkillDamage,
  calculateSkillDamageBreakdown,
  deriveSkillModel,
  getOperatorStats,
} from '../src/lib/damageCalculator.ts'
import {
  DAMAGE_CALCULATOR_PANEL_DEFAULTS,
  DAMAGE_OUTPUT_PANELS,
  getDamageCalculatorPanelNumbers,
  getDamageOutputPanelState,
} from '../src/lib/damageCalculatorPanels.ts'
import {
  DEFAULT_DAMAGE_CALCULATOR_OPERATOR_NAME,
  resolveDamageCalculatorDefaultOperatorId,
} from '../src/lib/damageCalculatorPreferences.ts'
import {
  getDamageSensitivityTablePoints,
  selectDamageSensitivityType,
  selectDamageSensitivityValues,
} from '../src/lib/damageSensitivity.ts'
import { getOperatorPassives } from '../src/lib/operatorProfile.ts'

test('統合後の各パネルの初期開閉状態を維持する', () => {
  assert.deepEqual(DAMAGE_CALCULATOR_PANEL_DEFAULTS, {
    operatorSearch: true,
    calculationConditions: true,
    operatorInfo: false,
    skillModel: false,
    commonOutput: true,
    subProfessionOutput: true,
    operatorOutput: true,
    skillOutput: true,
    normalCalculationProcess: false,
    skillCalculationProcess: false,
  })
})

test('初期オペレーターは保存値を優先し、未設定時はゴールデングローにする', () => {
  const operators = [
    { operatorId: 'char_350_surtr', operatorName: 'スルト' },
    { operatorId: 'char_377_gdglow', operatorName: 'ゴールデングロー' },
  ]

  assert.equal(DEFAULT_DAMAGE_CALCULATOR_OPERATOR_NAME, 'ゴールデングロー')
  assert.equal(
    resolveDamageCalculatorDefaultOperatorId(operators, 'char_350_surtr'),
    'char_350_surtr',
  )
  assert.equal(
    resolveDamageCalculatorDefaultOperatorId(operators, ''),
    'char_377_gdglow',
  )
  assert.equal(
    resolveDamageCalculatorDefaultOperatorId(operators, 'missing'),
    'char_377_gdglow',
  )
  assert.equal(
    resolveDamageCalculatorDefaultOperatorId([operators[0]], ''),
    'char_350_surtr',
  )
  assert.equal(resolveDamageCalculatorDefaultOperatorId([], ''), '')
})

test('出力を共通・職分・オペレーター・スキル固有の順に定義する', () => {
  assert.deepEqual(DAMAGE_OUTPUT_PANELS, {
    common: { number: '05', title: '共通出力' },
    subProfession: { number: '06', title: '職分固有出力' },
    operator: { number: '07', title: 'オペレーター固有出力' },
    skill: { number: '08', title: 'スキル固有出力' },
  })
})

test('出力内容が空でも4区分と後続パネルの番号を固定する', () => {
  assert.deepEqual(getDamageCalculatorPanelNumbers(), {
    commonOutput: '05',
    subProfessionOutput: '06',
    operatorOutput: '07',
    skillOutput: '08',
    normalCalculationProcess: '09',
    skillCalculationProcess: '10',
  })
})

test('固有出力がある場合だけ開閉可能にし、初期状態を開く', () => {
  assert.deepEqual(getDamageOutputPanelState(true, true), {
    open: true,
    disabled: false,
  })
  assert.deepEqual(getDamageOutputPanelState(true, false), {
    open: false,
    disabled: false,
  })
  assert.deepEqual(getDamageOutputPanelState(false, true), {
    open: false,
    disabled: true,
  })
  assert.deepEqual(getDamageOutputPanelState(false, false), {
    open: false,
    disabled: true,
  })
})

test('表の表示内容を1攻撃・DPS・総ダメージへ切り替える', () => {
  const normalBreakdown = calculateDamageBreakdown(1000, 'PHYSICAL', 200, 0)
  const skillBreakdown = calculateSkillDamageBreakdown(1000, 'PHYSICAL', 200, 0, {
    directMultiplierPercent: 0,
    attackScalePercent: 100,
    hitCount: 2,
    attackInterval: 2,
    duration: 10,
    ammoCount: 0,
  }, {
    canShowDps: true,
    totalMode: 'DURATION',
  })

  assert.deepEqual(selectDamageSensitivityValues({
    metric: 'DAMAGE',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown,
    canShowSkillTotal: true,
  }), { normal: 800, skill: 1600 })
  assert.deepEqual(selectDamageSensitivityValues({
    metric: 'DPS',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown,
    canShowSkillTotal: true,
  }), { normal: 400, skill: 800 })
  assert.deepEqual(selectDamageSensitivityValues({
    metric: 'DPS',
    normalBreakdown,
    normalAttackInterval: 0,
    skillBreakdown,
    canShowSkillTotal: true,
  }), { normal: null, skill: 800 })
  assert.deepEqual(selectDamageSensitivityValues({
    metric: 'TOTAL',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown,
    canShowSkillTotal: true,
  }), { normal: null, skill: 8000 })
  assert.deepEqual(selectDamageSensitivityValues({
    metric: 'TOTAL',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown,
    canShowSkillTotal: false,
  }), { normal: null, skill: null })
})

test('総ダメージ表は通常攻撃へフォールバックせずスキル種別だけを対象にする', () => {
  assert.equal(selectDamageSensitivityType('PHYSICAL', 'ARTS', 'TOTAL', true), 'ARTS')
  assert.equal(selectDamageSensitivityType('PHYSICAL', 'TRUE', 'TOTAL', true), 'TRUE')
  assert.equal(selectDamageSensitivityType('PHYSICAL', null, 'TOTAL', false), null)
  assert.equal(selectDamageSensitivityType('PHYSICAL', 'TRUE', 'DAMAGE', true), 'PHYSICAL')
  assert.equal(selectDamageSensitivityType('PHYSICAL', 'ARTS', 'DPS', true), 'ARTS')
})

test('スキル値を算出できない表では通常攻撃の種別を対象にする', () => {
  assert.equal(selectDamageSensitivityType('PHYSICAL', 'ARTS', 'DPS', false), 'PHYSICAL')
  assert.equal(selectDamageSensitivityType('ARTS', 'PHYSICAL', 'DAMAGE', false), 'ARTS')
  assert.equal(selectDamageSensitivityType('TRUE', 'ARTS', 'DPS', false), 'TRUE')
})

test('敵入力なしでも対象ダメージ種別ごとの表点を生成し、物理上限は最低保証地点まで自動拡張する', () => {
  assert.deepEqual(getDamageSensitivityTablePoints('ARTS'), [0, 20, 40, 60, 80, 95, 100])
  assert.deepEqual(getDamageSensitivityTablePoints('PHYSICAL'), [0, 500, 1000, 1500, 2000])
  assert.deepEqual(getDamageSensitivityTablePoints('PHYSICAL', [2800]), [0, 500, 1000, 1500, 2000, 3500])
  assert.deepEqual(getDamageSensitivityTablePoints('PHYSICAL', [12000]), [0, 500, 1000, 1500, 2000, 12500])
  assert.deepEqual(getDamageSensitivityTablePoints('TRUE'), [0])
  assert.deepEqual(getDamageSensitivityTablePoints(null), [0])
})

test('物理・術・確定ダメージへ敵防御を正しく適用する', () => {
  assert.equal(calculateDamage(1000, 'PHYSICAL', 300, 0), 700)
  assert.equal(calculateDamage(1000, 'PHYSICAL', 2000, 0), 50)
  assert.equal(calculateDamage(1000, 'ARTS', 0, 30), 700)
  assert.equal(calculateDamage(1000, 'TRUE', 2000, 100), 1000)
})

test('物理・術の最低保証を計算過程として返す', () => {
  const physical = calculateDamageBreakdown(1000, 'PHYSICAL', 2000, 0)
  assert.equal(physical.afterDefense, -1000)
  assert.equal(physical.minimumDamage, 50)
  assert.equal(physical.minimumApplied, true)
  assert.equal(physical.result, 50)

  const arts = calculateDamageBreakdown(1000, 'ARTS', 0, 100)
  assert.equal(arts.inputResistance, 100)
  assert.equal(arts.appliedResistance, 100)
  assert.equal(arts.afterResistance, 0)
  assert.equal(arts.minimumDamage, 50)
  assert.equal(arts.minimumApplied, true)
  assert.ok(Math.abs(arts.result - 50) < 1e-9)
})

test('攻撃力をA→B→C→D→Eの順で計算する', () => {
  const pipeline = calculateAttackPipeline(1000, {
    directAddition: 50,
    directMultiplierPercent: 20,
    finalAddition: 30,
    finalMultiplier: 0.81,
    attackScale: 1.5,
  })

  assert.equal(pipeline.afterDirectAddition, 1050)
  assert.equal(pipeline.afterDirectMultiplier, 1260)
  assert.equal(pipeline.afterFinalAddition, 1290)
  assert.equal(pipeline.afterFinalMultiplier, 1044)
  assert.equal(pipeline.finalAttack, 1566)
})

test('Dの切り捨てで整数近傍の浮動小数点誤差を拾わない', () => {
  const pipeline = calculateAttackPipeline(100, {
    directMultiplierPercent: 15,
  })

  assert.equal(pipeline.afterDirectMultiplier, 114.99999999999999)
  assert.equal(pipeline.afterFinalMultiplier, 115)
  assert.equal(pipeline.finalAttack, 115)
})

test('レベルと信頼度から攻撃力・攻撃間隔を補間する', () => {
  const stats = getOperatorStats({
    phases: [{
      maxLevel: 50,
      attributesKeyFrames: [
        { level: 1, data: { atk: 100, attackSpeed: 100, baseAttackTime: 1.2 } },
        { level: 50, data: { atk: 200, attackSpeed: 100, baseAttackTime: 1.2 } },
      ],
    }],
    favorKeyFrames: [
      { level: 0, data: { atk: 0 } },
      { level: 50, data: { atk: 20 } },
    ],
  }, 0, 50, 100)

  assert.equal(stats.attack, 220)
  assert.equal(stats.attackInterval, 1.2)
  assert.equal(stats.baseAttackBreakdown.levelAttack, 200)
  assert.equal(stats.baseAttackBreakdown.trustAttack, 20)
  assert.equal(stats.baseAttackBreakdown.potentialAttack, 0)
  assert.equal(stats.baseAttackBreakdown.moduleAttack, 0)
  assert.equal(stats.baseAttackBreakdown.result, 220)
})

test('Ash S1型のblackboardから攻撃力補正Bと連撃数を得る', () => {
  const model = deriveSkillModel({
    duration: -1,
    durationType: 'NONE',
    blackboard: [
      { key: 'atk', value: 0.15 },
      { key: 'attack@times', value: 2 },
    ],
  }, 1)

  assert.equal(model.directMultiplierPercent, 15)
  assert.equal(model.attackScalePercent, 100)
  assert.equal(model.hitCount, 2)
  assert.equal(model.attackInterval, 1)
})

test('裸のtimesは用途が一定しないため連撃数へ自動解釈しない', () => {
  const model = deriveSkillModel({
    blackboard: [{ key: 'times', value: 7 }],
  }, 1)

  assert.equal(model.hitCount, 1)
})

test('固定時間スキルの1ヒット・DPS・総量を計算する', () => {
  const output = calculateSkillDamage(1000, 'PHYSICAL', 200, 0, {
    directMultiplierPercent: 0,
    attackScalePercent: 120,
    hitCount: 2,
    attackInterval: 2,
    duration: 10,
    ammoCount: 0,
  }, {
    canShowDps: true,
    totalMode: 'DURATION',
  })

  assert.equal(output.perHit, 1000)
  assert.equal(output.perAttack, 2000)
  assert.equal(output.dps, 1000)
  assert.equal(output.total, 10000)
})

test('弾薬数をblackboardの互換キーと説明文の装填数から取得する', () => {
  const triggerTime = deriveSkillModel({
    duration: -1,
    durationType: 'AMMO',
    blackboard: [{ key: 'attack@s3_trigger_time', value: 10 }],
  }, 1)
  assert.equal(triggerTime.ammoCount, 10)

  const genericTriggerTime = deriveSkillModel({
    duration: -1,
    durationType: 'AMMO',
    blackboard: [{ key: 'attack@trigger_time', value: 31 }],
  }, 1)
  assert.equal(genericTriggerTime.ammoCount, 31)

  const description = deriveSkillModel({
    duration: -1,
    durationType: 'AMMO',
    description: '<@ba.vup>合計31発</>の弾薬を使用する',
    blackboard: [],
  }, 1)
  assert.equal(description.ammoCount, 31)

  const consumptionOnly = deriveSkillModel({
    duration: -1,
    durationType: 'AMMO',
    description: '攻撃するたびに弾薬を1発消費する',
    blackboard: [],
  }, 1)
  assert.equal(consumptionOnly.ammoCount, 0)
})

test('スキルの倍率・軽減・ヒット数・総量を同じ計算過程で返す', () => {
  const breakdown = calculateSkillDamageBreakdown(1000, 'PHYSICAL', 200, 0, {
    directMultiplierPercent: 0,
    attackScalePercent: 120,
    hitCount: 2,
    attackInterval: 2,
    duration: 10,
    ammoCount: 0,
  }, {
    canShowDps: true,
    totalMode: 'DURATION',
  })

  assert.equal(breakdown.attackPipeline.finalAttack, 1200)
  assert.equal(breakdown.mitigation.afterDefense, 1000)
  assert.equal(breakdown.perHit, 1000)
  assert.equal(breakdown.perAttack, 2000)
  assert.equal(breakdown.dps, 1000)
  assert.equal(breakdown.total, 10000)
  assert.equal(breakdown.totalMode, 'DURATION')
})

test('atkをB、atk_scaleをEとして同時に適用し、damage_scaleは対象外とする', () => {
  const model = deriveSkillModel({
    duration: -1,
    durationType: 'NONE',
    blackboard: [
      { key: 'atk', value: 0.2 },
      { key: 'atk_scale', value: 1.5 },
      { key: 'damage_scale', value: 2 },
    ],
  }, 1)

  assert.equal(model.directMultiplierPercent, 20)
  assert.equal(model.attackScalePercent, 150)
  assert.ok(model.notes.some((note) => note.includes('damage_scale')))

  const output = calculateSkillDamage(1000, 'TRUE', 0, 0, model, {
    canShowDps: true,
    totalMode: 'ACTIVATION',
  })
  assert.equal(output.perHit, 1800)

  const nestedScale = deriveSkillModel({
    duration: -1,
    durationType: 'NONE',
    blackboard: [{ key: 'attack@s1.atk_scale', value: 1.8 }],
  }, 1)
  assert.equal(nestedScale.attackScalePercent, 180)
})

test('現在の昇進段階で解放済みかつ潜在強化前の特性・素質を選ぶ', () => {
  const passives = getOperatorPassives({
    phases: [],
    favorKeyFrames: [],
    traitDescription: '通常攻撃が術ダメージを与える',
    trait: { candidates: [{ unlockCondition: { phase: 'PHASE_0', level: 1 }, requiredPotentialRank: 0 }] },
    talents: [{ candidates: [
      { unlockCondition: { phase: 'PHASE_1', level: 1 }, requiredPotentialRank: 0, name: '素質A', description: '基本効果' },
      { unlockCondition: { phase: 'PHASE_1', level: 1 }, requiredPotentialRank: 4, name: '素質A', description: '潜在強化' },
      { unlockCondition: { phase: 'PHASE_2', level: 1 }, requiredPotentialRank: 0, name: '素質A', description: '昇進2効果' },
    ] }],
  }, 1, 80)

  assert.equal(passives.traitDescription, '通常攻撃が術ダメージを与える')
  assert.deepEqual(passives.talents, [{ name: '素質A', description: '基本効果' }])
})

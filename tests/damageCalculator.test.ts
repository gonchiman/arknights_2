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
  getPrimaryDamageOutputKind,
  getPrimaryDamageOutputTitle,
} from '../src/lib/damageCalculatorPanels.ts'
import {
  DEFAULT_DAMAGE_CALCULATOR_OPERATOR_NAME,
  resolveDamageCalculatorDefaultOperatorId,
} from '../src/lib/damageCalculatorPreferences.ts'
import {
  DEFAULT_DAMAGE_SENSITIVITY_TARGET,
  getDamageSensitivityBreakdown,
  getDamageSensitivityMetricForTarget,
  getDamageSensitivityTableHeaders,
  getDamageSensitivityTablePoints,
  isDamageSensitivityMetricAvailable,
  selectDamageSensitivityType,
  selectDamageSensitivityValue,
} from '../src/lib/damageSensitivity.ts'
import { getOperatorPassives } from '../src/lib/operatorProfile.ts'
import {
  getOperatorMaxPotentialRank,
  getOperatorPotentialApplication,
} from '../src/lib/operatorPotentials.ts'

test('統合後の各パネルの初期開閉状態を維持する', () => {
  assert.deepEqual(DAMAGE_CALCULATOR_PANEL_DEFAULTS, {
    operatorSearch: true,
    calculationConditions: true,
    operatorInfo: false,
    skillModel: false,
    damageResult: true,
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

test('統合した計算結果とオペレーター・スキル固有出力を順に定義する', () => {
  assert.deepEqual(DAMAGE_OUTPUT_PANELS, {
    result: {
      number: '05',
      titles: {
        DEFAULT: 'デフォルト出力',
        SUB_PROFESSION: '職分固有出力',
      },
    },
    operator: { number: '06', title: 'オペレーター固有出力' },
    skill: { number: '07', title: 'スキル固有出力' },
  })
})

test('統合後の計算結果と後続パネルの番号を固定する', () => {
  assert.deepEqual(getDamageCalculatorPanelNumbers(), {
    damageResult: '05',
    operatorOutput: '06',
    skillOutput: '07',
    normalCalculationProcess: '08',
    skillCalculationProcess: '09',
  })
})

test('職分固有出力がある場合だけデフォルト出力と置き換える', () => {
  assert.equal(getPrimaryDamageOutputKind(true), 'SUB_PROFESSION')
  assert.equal(getPrimaryDamageOutputKind(false), 'DEFAULT')
  assert.equal(getPrimaryDamageOutputTitle('SUB_PROFESSION'), '職分固有出力')
  assert.equal(getPrimaryDamageOutputTitle('DEFAULT'), 'デフォルト出力')
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

test('選択した攻撃だけの1攻撃・DPS・総ダメージを返す', () => {
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

  assert.equal(selectDamageSensitivityValue({
    target: 'NORMAL',
    metric: 'DAMAGE',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown,
    canShowSkillTotal: true,
  }), 800)
  assert.equal(selectDamageSensitivityValue({
    target: 'NORMAL',
    metric: 'DPS',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown,
    canShowSkillTotal: true,
  }), 400)
  assert.equal(selectDamageSensitivityValue({
    target: 'NORMAL',
    metric: 'DPS',
    normalBreakdown,
    normalAttackInterval: 0,
    skillBreakdown,
    canShowSkillTotal: true,
  }), null)
  assert.equal(selectDamageSensitivityValue({
    target: 'SKILL',
    metric: 'DAMAGE',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown,
    canShowSkillTotal: true,
  }), 1600)
  assert.equal(selectDamageSensitivityValue({
    target: 'SKILL',
    metric: 'DPS',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown,
    canShowSkillTotal: true,
  }), 800)
  assert.equal(selectDamageSensitivityValue({
    target: 'SKILL',
    metric: 'TOTAL',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown,
    canShowSkillTotal: true,
  }), 8000)
  assert.equal(selectDamageSensitivityValue({
    target: 'SKILL',
    metric: 'TOTAL',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown,
    canShowSkillTotal: false,
  }), null)
})

test('通常攻撃の選択行計算データを1ヒット単位で返す', () => {
  const normalBreakdown = calculateDamageBreakdown(1000, 'PHYSICAL', 300, 0, {
    defenseIgnoreFixed: 100,
  })
  const breakdown = getDamageSensitivityBreakdown({
    target: 'NORMAL',
    metric: 'DAMAGE',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown: null,
    canShowSkillTotal: false,
  })

  assert.deepEqual(breakdown, {
    target: 'NORMAL',
    metric: 'DAMAGE',
    mitigation: normalBreakdown,
    hitCount: 1,
    perHit: 800,
    perAttack: 800,
    attackInterval: 2,
    dps: 400,
    totalMode: 'NONE',
    duration: 0,
    ammoCount: 0,
    total: null,
    minimumReached: false,
    finalValue: 800,
  })
  assert.equal(getDamageSensitivityBreakdown({
    target: 'NORMAL',
    metric: 'DPS',
    normalBreakdown,
    normalAttackInterval: 0,
    skillBreakdown: null,
    canShowSkillTotal: false,
  }), null)
})

test('物理の軽減後が負数でも選択行の計算過程用データへ保持する', () => {
  const normalBreakdown = calculateDamageBreakdown(1000, 'PHYSICAL', 2000, 0, {
    defenseIgnoreFixed: 100,
  })
  const breakdown = getDamageSensitivityBreakdown({
    target: 'NORMAL',
    metric: 'DAMAGE',
    normalBreakdown,
    normalAttackInterval: 2,
    skillBreakdown: null,
    canShowSkillTotal: false,
  })

  assert.equal(breakdown?.mitigation.appliedDefense, 1900)
  assert.equal(breakdown?.mitigation.afterDefense, -900)
  assert.equal(breakdown?.mitigation.minimumDamage, 50)
  assert.equal(breakdown?.perHit, 50)
  assert.equal(breakdown?.minimumReached, true)
  assert.equal(breakdown?.finalValue, 50)
})

test('スキル総ダメージの計算過程を1ヒットから総量まで保持する', () => {
  const skillBreakdown = calculateSkillDamageBreakdown(1000, 'ARTS', 0, 100, {
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
  const breakdown = getDamageSensitivityBreakdown({
    target: 'SKILL',
    metric: 'TOTAL',
    normalBreakdown: null,
    normalAttackInterval: 0,
    skillBreakdown,
    canShowSkillTotal: true,
  })

  assert.deepEqual(breakdown, {
    target: 'SKILL',
    metric: 'TOTAL',
    mitigation: skillBreakdown.mitigation,
    hitCount: 2,
    perHit: 50,
    perAttack: 100,
    attackInterval: 2,
    dps: 50,
    totalMode: 'DURATION',
    duration: 10,
    ammoCount: 0,
    total: 500,
    minimumReached: true,
    finalValue: 500,
  })
  assert.equal(getDamageSensitivityBreakdown({
    target: 'SKILL',
    metric: 'TOTAL',
    normalBreakdown: null,
    normalAttackInterval: 0,
    skillBreakdown,
    canShowSkillTotal: false,
  }), null)
})

test('初期表示はスキルにし、通常攻撃では総ダメージを1攻撃へ戻す', () => {
  assert.equal(DEFAULT_DAMAGE_SENSITIVITY_TARGET, 'SKILL')
  assert.equal(getDamageSensitivityMetricForTarget('NORMAL', 'TOTAL'), 'DAMAGE')
  assert.equal(getDamageSensitivityMetricForTarget('NORMAL', 'DAMAGE'), 'DAMAGE')
  assert.equal(getDamageSensitivityMetricForTarget('NORMAL', 'DPS'), 'DPS')
  assert.equal(getDamageSensitivityMetricForTarget('SKILL', 'TOTAL'), 'TOTAL')
  assert.equal(isDamageSensitivityMetricAvailable('NORMAL', 'TOTAL'), false)
  assert.equal(isDamageSensitivityMetricAvailable('NORMAL', 'DPS'), true)
  assert.equal(isDamageSensitivityMetricAvailable('SKILL', 'TOTAL'), true)
})

test('選択した攻撃のダメージ種別だけを対象にし、もう一方へフォールバックしない', () => {
  assert.equal(selectDamageSensitivityType('NORMAL', 'PHYSICAL', 'ARTS'), 'PHYSICAL')
  assert.equal(selectDamageSensitivityType('SKILL', 'PHYSICAL', 'ARTS'), 'ARTS')
  assert.equal(selectDamageSensitivityType('NORMAL', null, 'ARTS'), null)
  assert.equal(selectDamageSensitivityType('SKILL', 'PHYSICAL', null), null)
  assert.equal(selectDamageSensitivityType('NORMAL', 'TRUE', 'ARTS'), 'TRUE')
  assert.equal(selectDamageSensitivityType('SKILL', 'PHYSICAL', 'TRUE'), 'TRUE')
})

test('表見出しは軸と選択中の攻撃値だけの2列にする', () => {
  const normalHeaders = getDamageSensitivityTableHeaders({
    axisLabel: '防御力',
    target: 'NORMAL',
    metric: 'DAMAGE',
    skillTotalLabel: '効果時間総ダメージ',
  })
  const mechAccordHeaders = getDamageSensitivityTableHeaders({
    axisLabel: '術耐性',
    target: 'NORMAL',
    metric: 'DPS',
    skillTotalLabel: '効果時間総ダメージ',
    normalPrefix: '本体 ',
  })
  const skillHeaders = getDamageSensitivityTableHeaders({
    axisLabel: '術耐性',
    target: 'SKILL',
    metric: 'DPS',
    skillTotalLabel: '効果時間総ダメージ',
  })
  const skillTotalHeaders = getDamageSensitivityTableHeaders({
    axisLabel: '防御力',
    target: 'SKILL',
    metric: 'TOTAL',
    skillTotalLabel: '効果時間総ダメージ',
  })

  assert.deepEqual(normalHeaders, ['防御力', '通常攻撃 1ヒット'])
  assert.deepEqual(mechAccordHeaders, ['術耐性', '本体 通常攻撃 DPS'])
  assert.deepEqual(skillHeaders, ['術耐性', 'スキル DPS'])
  assert.deepEqual(skillTotalHeaders, ['防御力', 'スキル 効果時間総ダメージ'])
  assert.equal(normalHeaders.length, 2)
  assert.equal(skillHeaders.length, 2)
  assert.equal(normalHeaders.some((header) => header.includes('スキル')), false)
  assert.equal(skillHeaders.some((header) => header.includes('通常攻撃')), false)
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

test('潜在のATKと攻撃速度を累積し、表示ランクを内部条件へ変換する', () => {
  const profile = {
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
    potentialRanks: [
      {
        description: '攻撃力+10',
        buff: { attributes: { attributeModifiers: [
          { attributeType: 'ATK', formulaItem: 'ADDITION', value: 10 },
        ] } },
      },
      {
        description: '攻撃力+15',
        buff: { attributes: { attributeModifiers: [
          { attributeType: 1, formulaItem: 0, value: 15 },
        ] } },
      },
      {
        description: '攻撃速度+5',
        buff: { attributes: { attributeModifiers: [
          { attributeType: 7, formulaItem: 0, value: 5 },
        ] } },
      },
      {
        description: '防御力+50',
        buff: { attributes: { attributeModifiers: [
          { attributeType: 'DEF', formulaItem: 'ADDITION', value: 50 },
          { attributeType: 'MYSTERY_DAMAGE', formulaItem: 'ADDITION', value: 99 },
        ] } },
      },
      {
        description: '未対応の攻撃力式',
        buff: { attributes: { attributeModifiers: [
          { attributeType: 'ATK', formulaItem: 'MULTIPLICATION', value: 1.1 },
        ] } },
      },
    ],
  }

  assert.equal(getOperatorMaxPotentialRank(profile), 6)
  assert.equal(getOperatorPotentialApplication(profile, 0).potentialRank, 1)

  const potential = getOperatorPotentialApplication(profile, 4)
  assert.equal(potential.potentialRank, 4)
  assert.equal(potential.requiredPotentialRank, 3)
  assert.equal(potential.potentialAttack, 25)
  assert.equal(potential.attackSpeedBonus, 5)
  assert.equal(potential.unsupportedReasons.length, 0)

  const stats = getOperatorStats(profile, 0, 50, 100, {
    potentialAttack: potential.potentialAttack,
    attackSpeedBonus: potential.attackSpeedBonus,
  })
  assert.equal(stats.baseAttackBreakdown.potentialAttack, 25)
  assert.equal(stats.attack, 245)
  assert.equal(stats.attackSpeed, 105)
  assert.ok(Math.abs(stats.attackInterval - (1.2 * 100 / 105)) < 1e-9)

  const maximum = getOperatorPotentialApplication(profile, 99)
  assert.equal(maximum.potentialRank, 6)
  assert.equal(maximum.requiredPotentialRank, 5)
  assert.equal(maximum.potentialAttack, 25)
  assert.equal(maximum.effects.some((effect) => effect.status === 'NO_DIRECT_EFFECT'), true)
  assert.equal(maximum.effects.some((effect) => effect.status === 'UNSUPPORTED'), true)
  assert.equal(maximum.unsupportedReasons.some((reason) => reason.includes('MULTIPLICATION')), true)
  assert.equal(maximum.unsupportedReasons.some((reason) => reason.includes('MYSTERY_DAMAGE')), true)
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

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildComparisonCsv,
  buildSkillComparisonRow,
  getAvailableComparisonMetrics,
  type ComparisonMetric,
  type EnemyStatProfile,
} from '../src/lib/operatorComparison.ts'
import {
  detectNormalAttackDamageType,
  detectSkillDamageType,
  getExplicitDamageTypes,
} from '../src/lib/skillDamageModel.ts'
import type { EffectWindowType, SkillRecord } from '../src/types/skill.ts'

const ENEMY: EnemyStatProfile = { id: 'enemy-test', defense: 50, resistance: 0 }

test('通常攻撃のダメージ種別を特性から優先し、既知の職業へフォールバックする', () => {
  assert.equal(detectNormalAttackDamageType('WARRIOR', '敵に術ダメージを与える').damageType, 'ARTS')
  assert.equal(detectNormalAttackDamageType('CASTER').damageType, 'ARTS')
  assert.equal(detectNormalAttackDamageType('SNIPER').damageType, 'PHYSICAL')
  assert.equal(detectNormalAttackDamageType('SUPPORT').damageType, null)
  assert.equal(detectNormalAttackDamageType('MEDIC').damageType, null)
  assert.equal(detectNormalAttackDamageType('UNKNOWN').damageType, null)
})

test('非攻撃特性と条件付きの種別説明を通常攻撃と誤認しない', () => {
  const nonAttacking = detectNormalAttackDamageType(
    'SUPPORT',
    '敵を攻撃しない。味方が受ける物理ダメージを軽減する',
  )
  assert.equal(nonAttacking.damageType, null)
  assert.match(nonAttacking.reason, /攻撃を行わない/)

  const conditional = detectNormalAttackDamageType(
    'WARRIOR',
    'スキル発動中、敵に術ダメージを与える',
  )
  assert.equal(conditional.damageType, 'PHYSICAL')
  assert.equal(conditional.source, 'PROFESSION')
})

test('スキル説明の単一種別を検出し、範囲ダメージ表記にも対応する', () => {
  const skill = createSkill('NONE')
  skill.classification.damageComponents.value = ['BURST']

  setSkillDescription(skill, '攻撃力の200%の術範囲ダメージを与える')
  assert.deepEqual(getExplicitDamageTypes(skill.description), ['ARTS'])
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL').damageType, 'ARTS')

  setSkillDescription(skill, '攻撃力の200%の確定ダメージを与える')
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL').damageType, 'TRUE')
})

test('攻撃種別の変化表現とマークアップ・改行を自動検出する', () => {
  const skill = createSkill('FIXED_DURATION')
  setSkillDescription(skill, '攻撃力+120%、通常攻撃が術攻撃に変化する')
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL').damageType, 'ARTS')

  skill.classification.damageComponents.value = ['BURST']
  const markedUp = '攻撃力の200%の<@ba.vup>術範囲ダメージ</>\\nを与える'
  assert.deepEqual(getExplicitDamageTypes(markedUp), ['ARTS'])
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL', markedUp).damageType, 'ARTS')
})

test('被ダメージ軽減と追加ダメージを単一の攻撃種別と誤認しない', () => {
  assert.deepEqual(getExplicitDamageTypes('味方が受ける物理ダメージを軽減する'), [])
  assert.deepEqual(
    getExplicitDamageTypes('物理ダメージを受けた敵に術ダメージを与える'),
    ['ARTS'],
  )
  assert.deepEqual(getExplicitDamageTypes('物理ダメージを与えない'), [])
  assert.deepEqual(getExplicitDamageTypes('物理ダメージを与える敵から受けるダメージを軽減する'), [])

  const skill = createSkill('FIXED_DURATION')
  setSkillDescription(skill, '通常攻撃時、追加で術ダメージを与える')
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL').damageType, null)
  setSkillDescription(skill, '通常攻撃時、術ダメージを追加で与える')
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL').damageType, null)
  setSkillDescription(skill, '通常攻撃時、追加の術ダメージを与える')
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL').damageType, null)
  setSkillDescription(skill, '通常攻撃は術ダメージを与えない')
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL').damageType, null)

  setSkillDescription(skill, '攻撃時、敵に攻撃力の230%の物理ダメージを与える')
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL').damageType, 'PHYSICAL')

  skill.classification.damageComponents.value = ['NO_DIRECT_DAMAGE']
  setSkillDescription(skill, '味方が受ける物理ダメージを軽減する')
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL').damageType, null)
})

test('通常攻撃変化は通常種別を継承し、複合・根拠なしの瞬間攻撃は未対応にする', () => {
  const skill = createSkill('FIXED_DURATION')
  setSkillDescription(skill, '攻撃力が100%上昇し、2回連続で攻撃する')
  assert.equal(detectSkillDamageType(skill, 'ARTS').damageType, 'ARTS')
  assert.equal(detectSkillDamageType(skill, null).damageType, null)

  skill.classification.damageComponents.value = ['BURST']
  setSkillDescription(skill, '攻撃力の200%のダメージを与える')
  assert.equal(detectSkillDamageType(skill, 'PHYSICAL').damageType, null)

  setSkillDescription(skill, '物理ダメージと術ダメージを与える')
  const mixed = detectSkillDamageType(skill, 'PHYSICAL')
  assert.equal(mixed.damageType, null)
  assert.match(mixed.reason, /複数のダメージ種別/)
})

test('自動判定できない比較行をCSVで複合ダメージと断定しない', () => {
  const skill = createSkill('FIXED_DURATION')
  skill.profession = 'SUPPORT'
  skill.professionLabel = '補助'
  skill.operatorProfile.traitDescription = ''
  setSkillDescription(skill, '攻撃力+100%')

  const row = buildSkillComparisonRow(skill, [ENEMY], 'DAMAGE')
  const csv = buildComparisonCsv([row], [ENEMY], 'DAMAGE')

  assert.equal(row.damageType, null)
  assert.deepEqual(row.values, [null])
  assert.match(csv, /自動判定不可/)
})

test('終了条件に応じて選択可能な出力を制限する', () => {
  assert.deepEqual(getAvailableComparisonMetrics('FIXED_DURATION'), ['DAMAGE', 'DPS', 'TOTAL'])
  assert.deepEqual(getAvailableComparisonMetrics('AMMO'), ['DAMAGE', 'DPS', 'TOTAL'])
  assert.deepEqual(getAvailableComparisonMetrics('NONE'), ['DAMAGE', 'TOTAL'])
  assert.deepEqual(getAvailableComparisonMetrics('PERMANENT'), ['DAMAGE', 'DPS'])
  assert.deepEqual(getAvailableComparisonMetrics('TOGGLE_OR_MODE'), ['DAMAGE', 'DPS'])
  assert.deepEqual(getAvailableComparisonMetrics('UNKNOWN'), ['DAMAGE'])
})

test('最大育成状態でダメージ・DPS・スキル総ダメージを比較行へ変換する', () => {
  const skill = createSkill('FIXED_DURATION')

  assert.equal(calculateMetric(skill, 'DAMAGE'), 100)
  assert.equal(calculateMetric(skill, 'DPS'), 100)
  assert.equal(calculateMetric(skill, 'TOTAL'), 1000)
})

test('複数のダメージ種別を含むスキルは単一種別として計算しない', () => {
  const skill = createSkill('FIXED_DURATION')
  skill.description = '物理ダメージと術ダメージを与える'

  const row = buildSkillComparisonRow(skill, [ENEMY], 'DAMAGE')

  assert.equal(row.damageType, null)
  assert.deepEqual(row.values, [null])
  assert.ok(row.unavailableReasons.some((reason) => reason.includes('複数のダメージ種別')))
})

test('別々の式が必要な複合構成と未反映倍率は計算可能として扱わない', () => {
  const mixedComponents = createSkill('FIXED_DURATION')
  mixedComponents.classification.damageComponents.value = ['BASIC_ATTACK_MODIFIER', 'BURST']
  const mixedRow = buildSkillComparisonRow(mixedComponents, [ENEMY], 'DAMAGE')
  assert.deepEqual(mixedRow.values, [null])
  assert.ok(mixedRow.unavailableReasons.some((reason) => reason.includes('通常攻撃変化と瞬間攻撃')))

  const damageScale = createSkill('FIXED_DURATION')
  damageScale.skillLevels[0].blackboard?.push({ key: 'damage_scale', value: 3 })
  const damageScaleRow = buildSkillComparisonRow(damageScale, [ENEMY], 'DAMAGE')
  assert.deepEqual(damageScaleRow.values, [null])
  assert.ok(damageScaleRow.unavailableReasons.some((reason) => reason.includes('独立ダメージ倍率')))

  const unknownScale = createSkill('FIXED_DURATION')
  unknownScale.skillLevels[0].blackboard?.push({ key: 'd_atk_scale', value: 2.35 })
  const unknownScaleRow = buildSkillComparisonRow(unknownScale, [ENEMY], 'DAMAGE')
  assert.deepEqual(unknownScaleRow.values, [null])
  assert.ok(unknownScaleRow.unavailableReasons.some((reason) => reason.includes('d_atk_scale')))
})

test('倍率を特定できない単純モデルは数値を残しつつ概算として明示する', () => {
  const skill = createSkill('FIXED_DURATION')
  skill.skillLevels[0].blackboard = [{ key: 'attack@times', value: 2 }]

  const row = buildSkillComparisonRow(skill, [ENEMY], 'DAMAGE')

  assert.equal(row.values[0], 100)
  assert.deepEqual(row.unavailableReasons, [])
  assert.ok(row.warnings.some((warning) => warning.includes('特定できなかった')))
})

test('攻撃力を回復量に使う治療専用スキルを敵ダメージとして計算しない', () => {
  const skill = createSkill('FIXED_DURATION')
  skill.profession = 'TANK'
  skill.professionLabel = '重装'
  skill.description = '周囲の味方1人のHPを自身の攻撃力の180%回復'

  const row = buildSkillComparisonRow(skill, [ENEMY], 'DAMAGE')

  assert.deepEqual(row.values, [null])
  assert.ok(row.unavailableReasons.some((reason) => reason.includes('回復・治療')))
})

test('元素損傷を通常の物理・術ダメージとして計算しない', () => {
  const skill = createSkill('FIXED_DURATION')
  skill.description = '敵に術ダメージと壊死損傷を与える'

  const row = buildSkillComparisonRow(skill, [ENEMY], 'DAMAGE')

  assert.deepEqual(row.values, [null])
  assert.ok(row.unavailableReasons.some((reason) => reason.includes('元素損傷')))
})

test('弾薬制でも総量能力がない瞬間攻撃は全弾総ダメージを出さない', () => {
  const skill = createSkill('AMMO')
  skill.classification.damageComponents.value = ['BURST']
  skill.classification.outputCapabilities.canShowWindowTotal = false

  const row = buildSkillComparisonRow(skill, [ENEMY], 'TOTAL')

  assert.deepEqual(row.values, [null])
  assert.ok(row.unavailableReasons.some((reason) => reason.includes('全弾総ダメージ')))
})

test('最終昇進・最大レベル・信頼度100・最終スキルレベルを使う', () => {
  const skill = createSkill('FIXED_DURATION')
  skill.operatorProfile.phases.push({
    maxLevel: 2,
    attributesKeyFrames: [
      { level: 1, data: { atk: 200, attackSpeed: 100, baseAttackTime: 1 } },
      { level: 2, data: { atk: 300, attackSpeed: 100, baseAttackTime: 1 } },
    ],
  })
  skill.operatorProfile.favorKeyFrames = [
    { level: 0, data: { atk: 0 } },
    { level: 50, data: { atk: 20 } },
  ]
  skill.skillLevels.push({
    name: 'テストスキル',
    description: '物理ダメージを与える',
    duration: 10,
    durationType: 'NONE',
    blackboard: [
      { key: 'atk_scale', value: 2 },
      { key: 'attack@times', value: 2 },
    ],
  })

  const row = buildSkillComparisonRow(skill, [ENEMY], 'DAMAGE')

  assert.deepEqual(row.unavailableReasons, [])
  assert.equal(row.values[0], 1180)
})

test('エクシアの無条件攻撃力・攻撃速度素質を比較値へ反映する', () => {
  const skill = createSkill('FIXED_DURATION')
  applyExusiaiPassives(skill)

  const damageRow = buildSkillComparisonRow(skill, [ENEMY], 'DAMAGE')
  const dpsRow = buildSkillComparisonRow(skill, [ENEMY], 'DPS')

  assert.deepEqual(damageRow.unavailableReasons, [])
  assert.equal(damageRow.values[0], 112)
  assert.ok(Math.abs((dpsRow.values[0] ?? 0) - 112 / 0.893) < 1e-9)
  assert.deepEqual(damageRow.warnings, [])
})

test('スルトの特性と術耐性固定無視を術ダメージへ反映する', () => {
  const skill = createSkill('FIXED_DURATION')
  applySurtrPassives(skill)
  setSkillDescription(skill, '攻撃力が100%まで上昇')
  const enemy = { id: 'surtr-target', defense: 50, resistance: 50 }

  const row = buildSkillComparisonRow(skill, [enemy], 'DAMAGE')

  assert.equal(row.damageType, 'ARTS')
  assert.deepEqual(row.unavailableReasons, [])
  assert.equal(row.values[0], 140)
})

test('明示されたスキルのダメージ種別を特性の推奨値より優先する', () => {
  const skill = createSkill('FIXED_DURATION')
  applySurtrPassives(skill)
  setSkillDescription(skill, '物理ダメージを与える')
  const enemy = { id: 'physical-target', defense: 50, resistance: 50 }

  const row = buildSkillComparisonRow(skill, [enemy], 'DAMAGE')

  assert.equal(row.damageType, 'PHYSICAL')
  assert.equal(row.values[0], 100)
})

test('条件入力待ちと未対応の特性・素質を警告理由に追加する', () => {
  const skill = createSkill('FIXED_DURATION')
  skill.operatorId = 'char_172_svrash'
  skill.operatorName = 'シルバーアッシュ'
  skill.operatorProfile.trait = { candidates: [{
    unlockCondition: { phase: 'PHASE_0', level: 1 },
    requiredPotentialRank: 0,
    overrideDescription: '遠距離攻撃時の攻撃力が80%まで低下',
    blackboard: [{ key: 'atk_scale', value: 0.8 }],
  }] }
  skill.operatorProfile.talents = [{ candidates: [{
    unlockCondition: { phase: 'PHASE_0', level: 1 },
    requiredPotentialRank: 0,
    name: '未登録テスト',
    description: '与えるダメージが上昇',
    blackboard: [{ key: 'damage_scale', value: 1.2 }],
  }] }]

  const row = buildSkillComparisonRow(skill, [ENEMY], 'DAMAGE')

  assert.deepEqual(row.unavailableReasons, [])
  assert.ok(row.warnings.some((warning) => warning.includes('遠距離攻撃かどうかを選択')))
  assert.ok(row.warnings.some((warning) => warning.includes('blackboard「damage_scale」')))
})

test('CSVは表示行をUTF-8 BOM付きで引用し、敵条件と計算状態を含める', () => {
  const skill = createSkill('FIXED_DURATION')
  skill.operatorName = 'テスト, "A"'
  const row = buildSkillComparisonRow(skill, [ENEMY], 'DAMAGE')

  const csv = buildComparisonCsv([row], [ENEMY], 'DAMAGE')

  assert.ok(csv.startsWith('\uFEFF'))
  assert.match(csv, /"防御 50 \/ 術耐性 0"/)
  assert.match(csv, /"テスト, ""A"""/)
  assert.match(csv, /"100","計算可能"/)
})

function calculateMetric(skill: SkillRecord, metric: ComparisonMetric): number | null {
  const row = buildSkillComparisonRow(skill, [ENEMY], metric)
  assert.deepEqual(row.unavailableReasons, [])
  return row.values[0]
}

function applyExusiaiPassives(skill: SkillRecord) {
  skill.operatorId = 'char_103_angel'
  skill.operatorName = 'エクシア'
  skill.operatorProfile.trait = { candidates: [{
    unlockCondition: { phase: 'PHASE_0', level: 1 },
    requiredPotentialRank: 0,
    overrideDescription: '飛行ユニットを優先して攻撃',
    blackboard: [],
  }] }
  skill.operatorProfile.talents = [
    { candidates: [{
      unlockCondition: { phase: 'PHASE_0', level: 1 },
      requiredPotentialRank: 0,
      name: '高速装填',
      description: '攻撃速度+12',
      blackboard: [{ key: 'attack_speed', value: 12 }],
    }] },
    { candidates: [{
      unlockCondition: { phase: 'PHASE_0', level: 1 },
      requiredPotentialRank: 0,
      name: '天使の祝福',
      description: '攻撃力+6%、最大HP+10%',
      blackboard: [
        { key: 'atk', value: 0.06 },
        { key: 'max_hp', value: 0.1 },
      ],
    }] },
  ]
}

function applySurtrPassives(skill: SkillRecord) {
  skill.operatorId = 'char_350_surtr'
  skill.operatorName = 'スルト'
  skill.operatorProfile.trait = { candidates: [{
    unlockCondition: { phase: 'PHASE_0', level: 1 },
    requiredPotentialRank: 0,
    overrideDescription: '通常攻撃が術ダメージを与える',
    blackboard: [],
  }] }
  skill.operatorProfile.talents = [{ candidates: [{
    unlockCondition: { phase: 'PHASE_0', level: 1 },
    requiredPotentialRank: 0,
    name: '溶剣',
    description: '攻撃時、対象の術耐性を20無視',
    blackboard: [{ key: 'magic_resist_penetrate_fixed', value: 20 }],
  }] }]
}

function setSkillDescription(skill: SkillRecord, description: string) {
  skill.description = description
  skill.raw.description = description
  for (const level of skill.skillLevels) level.description = description
}

function createSkill(effectWindow: EffectWindowType): SkillRecord {
  const canShowDps = effectWindow !== 'NONE' && effectWindow !== 'UNKNOWN'
  return {
    id: 'char_test:skill_test',
    operatorId: 'char_test',
    operatorName: 'テスト',
    profession: 'SNIPER',
    professionLabel: '狙撃',
    subProfessionId: 'marksman',
    subProfessionName: '速射手',
    nameInitial: 'T_ROW',
    rarity: 6,
    skillIndex: 1,
    skillId: 'skill_test',
    skillName: 'テストスキル',
    description: '物理ダメージを与える',
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
        canShowSteadyStateDps: effectWindow === 'PERMANENT' || effectWindow === 'TOGGLE_OR_MODE',
        requiresModeSelection: false,
        requiresManualModel: false,
      },
      requiresManualModelReasons: [],
    },
    skillLevels: [{
      name: 'テストスキル',
      description: '物理ダメージを与える',
      duration: effectWindow === 'FIXED_DURATION' ? 10 : -1,
      durationType: effectWindow === 'AMMO' ? 'AMMO' : 'NONE',
      blackboard: [
        { key: 'atk_scale', value: 1 },
        { key: 'attack@times', value: 2 },
        ...(effectWindow === 'AMMO' ? [{ key: 'max_ammo', value: 5 }] : []),
      ],
    }],
    operatorProfile: {
      phases: [{
        maxLevel: 1,
        attributesKeyFrames: [
          { level: 1, data: { atk: 100, attackSpeed: 100, baseAttackTime: 1 } },
        ],
      }],
      favorKeyFrames: [{ level: 0, data: { atk: 0 } }],
      traitDescription: '敵に物理ダメージを与える',
      talents: [],
    },
    raw: {
      name: 'テストスキル',
      description: '物理ダメージを与える',
      duration: effectWindow === 'FIXED_DURATION' ? 10 : -1,
      durationType: effectWindow === 'AMMO' ? 'AMMO' : 'NONE',
      blackboard: [
        { key: 'atk_scale', value: 1 },
        { key: 'attack@times', value: 2 },
      ],
    },
  }
}

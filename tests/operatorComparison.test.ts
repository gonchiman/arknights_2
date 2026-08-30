import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildComparisonCsv,
  buildSkillComparisonRow,
  getAvailableComparisonMetrics,
  type ComparisonMetric,
  type EnemyStatProfile,
} from '../src/lib/operatorComparison.ts'
import type { EffectWindowType, SkillRecord } from '../src/types/skill.ts'

const ENEMY: EnemyStatProfile = { id: 'enemy-test', defense: 50, resistance: 0 }

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

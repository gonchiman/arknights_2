import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDamageCalculatorThreeCoverage, COVERAGE_STATUS_LABELS } from '../src/lib/damageCalculatorThreeCoverage.ts'
import { buildDamageCalculatorThreeOutput, getDamageCalculatorThreeStructures } from '../src/lib/damageCalculatorThree.ts'
import { getGuardPassiveCalculationConstraints } from '../src/lib/guardCombatPassives.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { GuardConditions, GuardStage } from '../src/lib/guardCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const data = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string;
    skills: { skillId: string; skillIndex: number; supported: boolean; raw: RawSkillLevel }[] }[]
}
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]

function record(id: string, index: number): SkillRecord {
  const operator = data.guards.find(value => value.id === id)!
  const entry = operator.skills.find(value => value.skillIndex === index)!
  const raw = structuredClone(entry.raw)
  return { id: `${id}/${index}`, operatorId: id, operatorName: operator.name, skillId: entry.skillId,
    skillIndex: index, skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(profiles.find(value => value.operatorId === id)!.operatorProfile) }
}
const catalog = data.guards.flatMap(operator => operator.skills.map(skill => record(operator.id, skill.skillIndex)))
const coverage = buildDamageCalculatorThreeCoverage(catalog)
const covered = (id: string, index: number) => coverage.find(row => row.skill.operatorId === id && row.skill.skillIndex === index)!
function calculate(skill: SkillRecord, guard: GuardConditions = {}) {
  return buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90,
    trust: 100, skillLevelIndex: 9, conditions: { guard } })
}
function stageConditions(stage: GuardStage): GuardConditions {
  if (!stage.when) return {}
  const { input, comparison, value } = stage.when
  return { [input]: typeof value === 'number' && comparison === 'GT' ? value + 1
    : typeof value === 'number' && comparison === 'LT' ? value - 1 : value }
}

test('登録90スキルを対応74・条件付き7・保留9に分類し、計算可能な範囲が81件ある', () => {
  assert.equal(coverage.length, 90)
  assert.equal(new Set(coverage.map(row => row.skill.id)).size, 90)
  assert.deepEqual(Object.fromEntries(Object.keys(COVERAGE_STATUS_LABELS).map(status =>
    [status, coverage.filter(row => row.status === status).length])),
  { SUPPORTED: 74, CONDITIONAL: 7, PENDING: 9, UNSUPPORTED: 0 })
  assert.equal(coverage.filter(row => row.calculationScope.length > 0).length, 81)
  for (const row of coverage) assert.equal(row.selection?.levelIndex, 9)
  const defaults = catalog.map(skill => calculate(skill))
  assert.equal(defaults.filter(output => output.rows.length > 0).length, 75)
  assert.equal(defaults.filter(output => output.unsupportedReasons.length > 0).length, 15)
})

test('取得済みカタログを1スキル1行にまとめ、レベル数の多いレコードを保持する', () => {
  const full = record('char_350_surtr', 3)
  const lower = { ...full, skillLevels: full.skillLevels.slice(0, 7) }
  const other = { ...full, id: 'new/1', operatorId: 'unregistered', skillId: 'shared-skill', skillIndex: 1,
    profession: 'CASTER', professionLabel: '術師', rarity: 5 }
  for (const input of [[lower, full, other, full], [full, lower, other]]) {
    const rows = buildDamageCalculatorThreeCoverage(input)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].skill, full)
    assert.equal(rows[1].status, 'UNSUPPORTED')
    assert.equal(rows[1].selection, undefined)
    assert.deepEqual(rows[1].calculationScope, [])
    assert.deepEqual(rows[1].supportedConditions, [])
  }
})

test('同じskillIdでもオペレーターやスキル番号が違えば登録を流用しない', () => {
  const skill = record('char_263_skadi', 1)
  const wrongOperator = { ...skill, operatorId: 'unregistered' }
  const wrongIndex = { ...skill, skillIndex: 2 }
  assert.deepEqual(buildDamageCalculatorThreeCoverage([skill, wrongOperator, wrongIndex]).map(row => row.status),
    ['SUPPORTED', 'UNSUPPORTED', 'UNSUPPORTED'])
})

test('旧sourceのsupported=falseに依存せず、通常の条件入力や注記を条件付きにしない', () => {
  const blaze = data.guards.find(operator => operator.id === 'char_017_huang')!
  assert.equal(blaze.skills[1].supported, false)
  assert.equal(covered(blaze.id, 2).status, 'SUPPORTED')
  for (const [operatorId, skillIndex] of [
    ['char_2024_chyue', 3], ['char_188_helage', 2], ['char_485_pallas', 3], ['char_4082_qiubai', 3],
  ] as const) {
    const row = covered(operatorId, skillIndex)
    assert.equal(row.status, 'SUPPORTED')
    assert.deepEqual(row.supportedConditions, [])
  }
  assert.ok(covered('char_2024_chyue', 3).scopeNotes.length > 0)
})

test('ベッローネのHP境界・重複上限の対応条件が実際の停止・解除条件と一致する', () => {
  for (const skillIndex of [1, 2, 3]) {
    const skill = record('char_4037_demetr', skillIndex)
    const row = covered(skill.operatorId, skillIndex)
    const maximum = skillIndex === 2 ? 8 : 5
    assert.equal(row.status, 'CONDITIONAL')
    assert.match(row.supportedConditions.join(' '), /100%.*20%以下/)
    assert.match(row.supportedConditions.join(' '), new RegExp(`${maximum}回`))
    for (const targetHpPercent of [100, 20, 0]) {
      const output = calculate(skill, { targetHpPercent, defenseDebuffStacks: maximum })
      assert.deepEqual(output.unsupportedReasons, [])
      assert.ok(output.rows.length > 0)
    }
    for (const conditions of [{ targetHpPercent: 50, defenseDebuffStacks: maximum },
      { targetHpPercent: 100, defenseDebuffStacks: maximum - 1 }]) {
      const output = calculate(skill, conditions)
      assert.deepEqual(output.rows, [])
      assert.ok(output.unsupportedReasons.some(reason => row.deferredReasons.some(deferred => reason.includes(deferred))))
    }
  }
})

test('デーゲンブレヒャーは全スキルが攻撃前から戦慄中なら計算できる', () => {
  for (const skillIndex of [1, 2, 3]) {
    const skill = record('char_4116_blkkgt', skillIndex)
    const row = covered(skill.operatorId, skillIndex)
    assert.equal(row.status, 'CONDITIONAL')
    assert.match(row.supportedConditions.join(' '), /攻撃開始前.*戦慄中/)
    assert.deepEqual(calculate(skill, { targetTrembling: false }).rows, [])
    const output = calculate(skill, { targetTrembling: true })
    assert.deepEqual(output.unsupportedReasons, [])
    assert.ok(output.rows.length > 0)
  }
})

test('耀騎士ニアールS3は通常・確定攻撃の計算可能範囲と召喚時の保留を両方残す', () => {
  const skill = record('char_1014_nearl2', 3)
  const row = covered(skill.operatorId, 3)
  assert.equal(row.status, 'CONDITIONAL')
  assert.equal(row.calculationScope.length, 2)
  assert.match(row.supportedConditions.join(' '), /ブロック条件なし.*ブロック条件成立/)
  assert.match(row.deferredReasons.join(' '), /召喚時.*適用順序/)
  assert.ok(row.calculationScope.every(scope => !scope.includes('召喚')))
  for (const phase of ['normal', 'true']) assert.ok(calculate(skill, { phase }).rows.length > 0)
  assert.deepEqual(calculate(skill, { phase: 'sun' }).rows, [])
})

test('全段階が保留の9スキルは具体的理由を持ち、素質だけが阻むチェン3も含む', () => {
  const pending = coverage.filter(row => row.status === 'PENDING')
  assert.deepEqual(pending.map(row => `${row.skill.operatorId}/${row.skill.skillIndex}`).sort(), [
    'char_2024_chyue/2', 'char_4182_oblvns/2', 'char_4182_oblvns/3', 'char_1051_headb2/3',
    'char_1050_chen3/1', 'char_1050_chen3/2', 'char_1050_chen3/3', 'char_4010_etlchi/3', 'char_1043_leizi2/3',
  ].sort())
  for (const row of pending) {
    assert.deepEqual(row.calculationScope, [])
    assert.ok(row.deferredReasons.length > 0)
    const structure = getDamageCalculatorThreeStructures().find(structure =>
      structure.basicInfo.operatorId === row.skill.operatorId && structure.basicInfo.skillIndex === row.skill.skillIndex)!
    for (const stage of structure.guardRecipe!.stages) {
      const output = calculate(row.skill, stageConditions(stage))
      assert.deepEqual(output.rows, [])
      assert.ok(output.unsupportedReasons.length > 0)
    }
  }
  for (const skillIndex of [1, 2, 3]) assert.match(covered('char_1050_chen3', skillIndex).deferredReasons.join(' '), /弱点ダメージ/)
})

test('既存15スキルの保留事項は詳細に残し、現在の計算範囲の対応を下げない', () => {
  const legacy = getDamageCalculatorThreeStructures().filter(structure => !structure.guardRecipe)
  assert.equal(legacy.length, 15)
  for (const structure of legacy) assert.equal(covered(structure.basicInfo.operatorId, structure.basicInfo.skillIndex).status, 'SUPPORTED')
  for (const [operator, index] of [['char_350_surtr', 3], ['char_293_thorns', 3], ['char_4009_irene', 1], ['char_4009_irene', 3]] as const) {
    const row = covered(operator, index)
    assert.ok(row.deferredReasons.length > 0)
    assert.ok(row.scopeNotes.length > 0)
  }
})

test('計算用のデータ欠落・入力不正を、機能未対応の分類へ混ぜない', () => {
  const skill = record('char_017_huang', 2)
  skill.skillLevels = []
  skill.operatorProfile.talents = []
  const row = buildDamageCalculatorThreeCoverage([skill])[0]
  assert.equal(row.status, 'SUPPORTED')
  assert.equal(row.selection?.levelIndex, 9)
  const output = calculate(skill, { actualAttackTargetCount: NaN })
  assert.deepEqual(output.rows, [])
  assert.ok(output.unsupportedReasons.length > 0)
})

test('一覧に使う共有制約の理由が計算器でも同じ停止理由になる', () => {
  for (const structure of getDamageCalculatorThreeStructures()) {
    const recipe = structure.guardRecipe
    if (!recipe) continue
    for (const stage of recipe.stages) {
      const constraints = getGuardPassiveCalculationConstraints(recipe.operatorId,
        { kind: stage.kind, skillIndex: recipe.skillIndex, stageId: stage.id })
      if (!constraints.length) continue
      const output = calculate(record(recipe.operatorId, recipe.skillIndex),
        { ...stageConditions(stage), targetHpPercent: 50, defenseDebuffStacks: 0, targetTrembling: false })
      for (const constraint of constraints) {
        assert.ok(output.unsupportedReasons.some(reason => reason.endsWith(constraint.reason)))
        assert.ok(covered(recipe.operatorId, recipe.skillIndex).deferredReasons.some(reason => reason.endsWith(constraint.reason)))
      }
    }
  }
})

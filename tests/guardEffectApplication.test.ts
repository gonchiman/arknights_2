import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildGuardSkillApplicationRows, buildGuardTalentApplicationRows } from '../src/lib/guardEffectApplication.ts'
import { GUARD_SKILL_RECIPES } from '../src/lib/guardSkillRecipes.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { GuardConditions } from '../src/lib/guardCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const sources = (JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string; skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
}).guards
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
function input(id: string, index: number, guard: GuardConditions = {}): DamageCalculatorThreeInput {
  const source = sources.find(source => source.id === id)!
  const entry = source.skills.find(skill => skill.skillIndex === index)!
  const raw = structuredClone(entry.raw)
  const skill: SkillRecord = { id: `${id}/${index}`, operatorId: id, operatorName: source.name, skillId: entry.skillId,
    skillIndex: index, skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(profiles.find(profile => profile.operatorId === id)!.operatorProfile) }
  return { operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 9, conditions: { guard } }
}
function evaluate(value: DamageCalculatorThreeInput) {
  const output = buildDamageCalculatorThreeOutput(value)
  return { output, skills: buildGuardSkillApplicationRows(value, output), talents: buildGuardTalentApplicationRows(value, output) }
}

test('Guardの全75スキルで表示行作成が計算結果を変更せず、保留を適用済みにしない', () => {
  assert.equal(GUARD_SKILL_RECIPES.length, 75)
  for (const recipe of GUARD_SKILL_RECIPES) for (const stage of recipe.stages) {
    const value = input(recipe.operatorId, recipe.skillIndex, stage.when ? { [stage.when.input]: stage.when.value } : {})
    const output = buildDamageCalculatorThreeOutput(value)
    const before = structuredClone(output)
    const rows = [...buildGuardSkillApplicationRows(value, output), ...buildGuardTalentApplicationRows(value, output)]
    assert.ok(rows.length > 0)
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length)
    assert.deepEqual(output, before)
    assert.ok(rows.every(row => row.category !== 'TRAIT'))
    if (!output.model) assert.ok(rows.every(row => row.status !== 'APPLIED'), `${recipe.operatorId} S${recipe.skillIndex}`)
  }
})

test('選択段階のみを適用し、構え切替でも別段階の効果を表示に残す', () => {
  const { skills } = evaluate(input('char_264_f12yin', 2, { phase: 'stance' }))
  assert.ok(skills.filter(row => row.stage === '初期状態').every(row => row.status === 'INACTIVE_STAGE'))
  assert.equal(skills.find(row => row.stage === '猛虎の構え' && row.item === '攻撃力')?.status, 'APPLIED')
  assert.equal(skills.find(row => row.item === '持続時間')?.status, 'NOT_RELEVANT')
})

test('累積入力をpreview値で置き換えず、値と条件とタイミングを分離する', () => {
  const value = input('char_4082_qiubai', 3, { attackStacks: 4 })
  const { skills } = evaluate(value)
  const speed = skills.find(row => row.item === '攻撃速度')!
  const amount = value.skill.raw.blackboard!.find(entry => entry.key === 'attack_speed')!.value!
  assert.equal(speed.value, `＋${amount * 4}`)
  assert.match(speed.condition, /累積数：4/)
  assert.equal(speed.timing, 'スキル中')
  assert.equal(speed.stage, undefined)
  assert.equal(skills.find(row => row.item === '攻撃：ダメージ属性')?.timing, '通常攻撃時')
})

test('攻撃列の属性・倍率・回数・対象数は独立した行で、複合属性も保持する', () => {
  const { skills, output } = evaluate(input('char_010_chen', 2, { actualAttackTargetCount: 7, enemyResistance: 40 }))
  for (const label of ['物理斬撃', '術斬撃']) {
    assert.equal(skills.filter(row => row.item.startsWith(`${label}：`)).length, 4)
    assert.equal(skills.find(row => row.item === `${label}：攻撃倍率`)?.value, '×5')
    assert.equal(skills.find(row => row.item === `${label}：攻撃回数`)?.value, '1回')
    assert.equal(skills.find(row => row.item === `${label}：命中対象数`)?.value, '7体')
  }
  const attack = Math.floor(output.stats.attack * 1.05 + 1e-9) * 5
  const expected = Math.max(attack - 1000, attack * 0.05) + attack * 0.6
  assert.equal(output.rows.find(row => row.axisValue === 1000)?.perAttack, expected)
})

test('未解決のスキル・不正入力・欠落した数値を適用扱いせず理由を維持する', () => {
  const unresolved = evaluate(input('char_4182_oblvns', 2))
  assert.ok(unresolved.skills.some(row => row.status === 'UNSUPPORTED' && /命中頻度/.test(row.reason)))
  for (const guard of [{ actualAttackTargetCount: NaN }, { phase: 'missing' }]) {
    const result = evaluate(input('char_264_f12yin', 2, guard))
    assert.ok(result.skills.every(row => row.status !== 'APPLIED'))
    assert.ok(result.talents.every(row => row.status !== 'APPLIED'))
    assert.ok(result.talents.some(row => row.status === 'UNVERIFIED'))
  }
  const value = input('char_017_huang', 2)
  value.skill.skillLevels[9].blackboard = value.skill.skillLevels[9].blackboard?.filter(entry => entry.key !== 'atk')
  const missing = evaluate(value).skills.find(row => row.item === '攻撃力')!
  assert.equal(missing.value, '未確認')
  assert.equal(missing.status, 'UNVERIFIED')
  assert.match(missing.reason, /参照値「atk」/)
})

test('素質の発動確率を効果値から分離し、特性は混入させない', () => {
  const { talents, output } = evaluate(input('char_264_f12yin', 1))
  const row = talents.find(row => row.name === 'ハードパンチャー')!
  assert.equal(row.item, '攻撃倍率')
  assert.equal(row.value, '×1.6')
  assert.equal(row.probability, '20%')
  assert.equal(row.categoryLabel, '素質1')
  assert.ok(output.guard?.evaluations.some(row => row.sourceKind === 'TRAIT'))
  assert.ok(talents.every(row => row.category === 'TALENT'))
})

test('素質の条件不成立・計算対象外を保持し、明示された条件なしを未確認にしない', () => {
  const { talents } = evaluate(input('char_4082_qiubai', 3, { targetSlowedOrBound: false }))
  assert.equal(talents.find(row => row.name === '虚突')?.status, 'CONDITION_FALSE')
  assert.match(talents.find(row => row.name === '虚突')!.condition, /足止め・バインド中：あり/)
  assert.equal(talents.find(row => row.name === '落英')?.status, 'NOT_RELEVANT')
  const unconditional = evaluate(input('char_010_chen', 2)).talents.find(row => row.name === '帯刀格闘術')!
  assert.equal(unconditional.condition, 'なし')
  const pallas = evaluate(input('char_485_pallas', 1, { selfHpPercent: 30 })).talents.find(row => row.item === '攻撃力')!
  assert.equal(pallas.status, 'CONDITION_FALSE')
  assert.match(pallas.condition, /自身のHP ≧ 80/)
})

test('素質の入力不正で評価が中断しても未確認の素質行を残す', () => {
  const { talents } = evaluate(input('char_188_helage', 2, { selfHpPercent: NaN }))
  assert.equal(talents.length, 2)
  assert.ok(talents.every(row => row.status === 'UNVERIFIED'))
  assert.ok(talents.every(row => row.condition === '未確認'))
  assert.ok(talents.every(row => /入力|数値/.test(row.reason)))
})

test('強化攻撃・発動1回では攻撃速度を計算対象外とし、通常攻撃のDPSでは適用する', () => {
  const first = evaluate(input('char_188_helage', 1, { selfHpPercent: 100 }))
  const faster = evaluate(input('char_188_helage', 1, { selfHpPercent: 30 }))
  assert.equal(first.output.rows[0].perAttack, faster.output.rows[0].perAttack)
  assert.equal(faster.talents.find(row => row.item === '攻撃速度')?.value, '＋100')
  assert.equal(faster.talents.find(row => row.item === '攻撃速度')?.status, 'NOT_RELEVANT')
  assert.equal(evaluate(input('char_4121_zuole', 3)).talents.find(row => row.item === '攻撃速度')?.status, 'NOT_RELEVANT')
  assert.equal(evaluate(input('char_188_helage', 2)).talents.find(row => row.item === '攻撃速度')?.status, 'APPLIED')
})

test('確定ダメージだけの段階では素質の防御力無視を適用扱いにしない', () => {
  const physical = evaluate(input('char_1014_nearl2', 3, { phase: 'normal' }))
  const trueDamage = evaluate(input('char_1014_nearl2', 3, { phase: 'true' }))
  assert.equal(physical.talents.find(row => row.item === '防御力無視')?.status, 'APPLIED')
  assert.equal(trueDamage.talents.find(row => row.item === '防御力無視')?.status, 'NOT_RELEVANT')
  assert.ok(trueDamage.output.rows.every(row => row.perAttack === trueDamage.output.rows[0].perAttack))
})

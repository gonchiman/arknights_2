import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, type DamageCalculatorThreeInput } from '../src/lib/damageCalculatorThree.ts'
import { buildDamageCalculatorThreeApplicationRows } from '../src/lib/damageCalculatorThreeApplications.ts'
import type { GuardSource } from '../src/lib/guardCombatTypes.ts'
import type { OperatorCombatProfile, SkillRecord } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')).guards as GuardSource[]
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as { operatorId: string; operatorProfile: OperatorCombatProfile }[]
function input(operatorId: string, skillIndex: number, conditions: DamageCalculatorThreeInput['conditions'] = {}): DamageCalculatorThreeInput {
  const source = sources.find(source => source.id === operatorId)!
  const selected = source.skills.find(skill => skill.skillIndex === skillIndex)!
  const raw = structuredClone(selected.raw)
  const skill: SkillRecord = {
    id: `${operatorId}/${skillIndex}`, operatorId, operatorName: source.name, skillId: selected.skillId, skillIndex,
    skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', subProfessionId: source.subProfessionId,
    subProfessionName: source.subProfessionId, nameInitial: 'A_ROW', rarity: 6,
    raw, description: raw.description!, duration: raw.duration!, durationType: raw.durationType!,
    spType: raw.spData!.spType!, initSp: raw.spData!.initSp!, spCost: raw.spData!.spCost!, skillType: raw.skillType!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => raw),
    operatorProfile: structuredClone(profiles.find(profile => profile.operatorId === operatorId)!.operatorProfile),
  }
  return { operator: skill, skill, phaseIndex: 2, operatorLevel: 90, trust: 100, skillLevelIndex: 9, conditions }
}
function calculate(args: DamageCalculatorThreeInput) {
  const output = buildDamageCalculatorThreeOutput(args)
  const before = structuredClone(output)
  const rows = buildDamageCalculatorThreeApplicationRows(args, output)
  assert.deepEqual(output, before, '適用表示は計算結果や適用状態を変更しない')
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, '表示行のIDは一意')
  return { output, rows }
}

test('スルトS2の実対象数を変えると倍率だけが条件不成立となり、射程と余燼は計算対象外のまま', () => {
  const single = calculate(input('char_350_surtr', 2, { actualAttackTargetCount: 1 }))
  const multiple = calculate(input('char_350_surtr', 2, { actualAttackTargetCount: 2 }))
  assert.equal(single.rows.find(row => row.category === 'SKILL' && row.item === '攻撃倍率')?.status, 'APPLIED')
  assert.equal(multiple.rows.find(row => row.category === 'SKILL' && row.item === '攻撃倍率')?.status, 'CONDITION_FALSE')
  assert.ok(multiple.rows.some(row => row.category === 'TRAIT' && row.status === 'APPLIED'))
  for (const { rows } of [single, multiple]) {
    assert.equal(rows.find(row => row.item === '攻撃範囲')?.status, 'NOT_RELEVANT')
    assert.ok(rows.filter(row => row.name === '余燼').every(row => row.status === 'NOT_RELEVANT'))
    assert.equal(rows.find(row => row.item === '攻撃力')?.value, '＋120％')
    assert.equal(rows.find(row => row.item === '強制退場')?.timing, '致命ダメージから8秒後')
  }
})

test('ソーンズS3は初回と2回目以降を区別し、現在の段階にだけスキル効果を適用する', () => {
  for (const skillActivationCount of [1, 2]) {
    const { output, rows } = calculate(input('char_293_thorns', 3, { skillActivationCount }))
    const skillRows = rows.filter(row => row.category === 'SKILL')
    assert.ok(skillRows.some(row => row.stage === output.activeStageLabel && row.status === 'APPLIED'))
    assert.ok(skillRows.filter(row => row.stage !== output.activeStageLabel).every(row => row.status === 'INACTIVE_STAGE'))
  }
})

test('アイリーニの複数打撃は属性・倍率・回数を分け、浮遊不可でも直接ダメージを残す', () => {
  const { rows } = calculate(input('char_4009_irene', 1, { targetCanBeLevitated: false }))
  assert.equal(rows.find(row => row.item === '状態付与')?.status, 'CONDITION_FALSE')
  assert.equal(rows.filter(row => row.category === 'SKILL' && row.item.endsWith('攻撃倍率') && row.status === 'APPLIED').length, 2)
  assert.equal(rows.filter(row => row.category === 'SKILL' && row.item.endsWith('打撃回数')).length, 2)
  const ground = rows.find(row => row.category === 'TALENT' && row.probability === '50％')
  assert.equal(ground?.status, 'APPLIED')
  assert.equal(rows.find(row => row.category === 'TALENT' && row.probability === '100％' && row.item === '防御力割合無視')?.status, 'CONDITION_FALSE')
  assert.equal(rows.find(row => row.category === 'TALENT' && row.item === '攻撃速度' && row.value === '18')?.status, 'NOT_RELEVANT')
})

test('不正な入力や計算不能なスキルでは定義を適用済みと表示しない', () => {
  for (const args of [
    input('char_350_surtr', 2, { actualAttackTargetCount: NaN }),
    input('char_4009_irene', 3, { targetWeight: 4 }),
    input('char_2024_chyue', 2),
  ]) {
    const { output, rows } = calculate(args)
    assert.equal(output.rows.length, 0)
    assert.ok(rows.length > 0)
    assert.equal(rows.some(row => row.status === 'APPLIED'), false)
    assert.ok(rows.some(row => row.status === 'UNVERIFIED' || row.status === 'UNSUPPORTED'))
  }
})

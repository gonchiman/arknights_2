import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import {
  buildDamageCalculatorThreeOutput,
  getDamageCalculatorThreeStructures,
  type DamageCalculatorThreeConditions,
} from '../src/lib/damageCalculatorThree.ts'
import { buildDamageCalculatorThreeSkillInformation } from '../src/lib/damageCalculatorThreeSkillInformation.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const source = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string;
    skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
}
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
const structures = getDamageCalculatorThreeStructures()

function record(id: string, index: number): SkillRecord {
  const operator = source.guards.find(candidate => candidate.id === id)!
  const entry = operator.skills.find(candidate => candidate.skillIndex === index)!
  const raw = entry.raw
  return { id: `${id}/${index}`, operatorId: id, operatorName: operator.name, skillId: entry.skillId,
    skillIndex: index, skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId: operator.subProfessionId, subProfessionName: operator.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => raw), raw,
    operatorProfile: profiles.find(candidate => candidate.operatorId === id)!.operatorProfile }
}
function example(id: string, index: number, conditions: DamageCalculatorThreeConditions = {}) {
  const skill = record(id, index)
  const structure = structures.find(candidate => candidate.basicInfo.operatorId === id && candidate.basicInfo.skillIndex === index)!
  assert.ok(structure)
  const output = buildDamageCalculatorThreeOutput({ operator: skill, skill, phaseIndex: 2, operatorLevel: 90,
    trust: 100, skillLevelIndex: 9, conditions })
  return { skill, structure, output,
    values: Object.fromEntries(buildDamageCalculatorThreeSkillInformation(structure, skill, output)) }
}

test('スルトS1〜S3の回復方法・発動方法・SP・持続を構造化データから表示する', () => {
  assert.deepEqual(example('char_350_surtr', 1).values, {
    SP回復方法: '攻撃回復', 発動方法: '自動発動', 初期SP: 0, 必要SP: 2, 持続: '通常攻撃1回',
  })
  assert.deepEqual(example('char_350_surtr', 2).values, {
    SP回復方法: '自然回復', 発動方法: '手動発動', 初期SP: 12, 必要SP: 18, 持続: '18秒',
  })
  assert.deepEqual(example('char_350_surtr', 3).values, {
    SP回復方法: '自然回復', 発動方法: '手動発動', 初期SP: 0, 必要SP: 5, 持続: '退場まで',
  })
})

test('配置時スキルでは負のsource期間を表示せず、SPなしを区別する', () => {
  const { values, structure } = example('char_263_skadi', 2)
  assert.equal(structure.source.duration, -1)
  assert.deepEqual(values, { SP回復方法: 'SPなし', 発動方法: 'パッシブ', 初期SP: '—', 必要SP: '—', 持続: '30秒' })
})

test('ソーンズS3とヴィヴィアナS3の持続は選択した発動回数に追随する', () => {
  assert.equal(example('char_293_thorns', 3, { skillActivationCount: 1 }).values.持続, '30秒')
  assert.equal(example('char_293_thorns', 3, { skillActivationCount: 2 }).values.持続, '退場まで')
  assert.equal(example('char_4098_vvana', 3, { guard: { skillActivationCount: 1 } }).values.持続, '15秒')
  assert.equal(example('char_4098_vvana', 3, { guard: { skillActivationCount: 2 } }).values.持続, '25秒')
})

test('状態切替、弾薬制、次回攻撃、発動1回を秒数に置き換えない', () => {
  for (const id of ['char_172_svrash', 'char_264_f12yin', 'char_4088_hodrer', 'char_4182_oblvns']) {
    assert.equal(example(id, 2).values.持続, '次の状態切替まで', id)
  }
  for (const index of [1, 2, 3]) assert.equal(example('char_1032_excu2', index).values.持続, '弾薬制')
  assert.equal(example('char_4082_qiubai', 1).values.持続, '通常攻撃1回')
  for (const index of [2, 3]) assert.equal(example('char_4009_irene', index).values.持続, 'スキル発動1回')
})

test('個別のダメージ動作を選択しても、スキル全体の有限の持続を表示する', () => {
  assert.equal(example('char_4010_etlchi', 2).values.持続, '12秒')
  for (const phase of ['normal', 'start', 'end']) {
    assert.equal(example('char_4082_qiubai', 2, { guard: { phase } }).values.持続, '5秒')
  }
  assert.equal(example('char_1050_chen3', 2).values.持続, '6秒')
})

test('異なるスキル・レベルの計算結果は持続の表示に流用しない', () => {
  const thorns = example('char_293_thorns', 3, { skillActivationCount: 2 })
  const viviana = example('char_4098_vvana', 3, { guard: { skillActivationCount: 2 } })
  assert.equal(Object.fromEntries(buildDamageCalculatorThreeSkillInformation(viviana.structure, viviana.skill, thorns.output)).持続, '15秒')
  const foreignLevel = { ...viviana.output, structure: { ...viviana.structure,
    basicInfo: { ...viviana.structure.basicInfo, levelIndex: 8 } } }
  assert.equal(Object.fromEntries(buildDamageCalculatorThreeSkillInformation(viviana.structure, viviana.skill, foreignLevel)).持続, '15秒')
})

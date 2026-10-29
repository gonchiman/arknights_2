import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildStructureCoverage, summarizeStructureCoverage, filterStructureCoverage, DEFAULT_STRUCTURE_COVERAGE_FILTERS } from '../src/lib/structureCoverage.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import { EXPANDED_OPERATOR_SOURCES } from '../src/lib/expandedCombatRegistry.ts'
import { buildTraitStructures } from '../src/lib/traitStructure.ts'
import { parseHashRoute } from '../src/lib/routes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const sources = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string;
    skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
}
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
function makeRecord(operatorId: string, operatorName: string, subProfessionId: string, profile: OperatorCombatProfile,
  skill: { skillId: string; skillIndex: number; raw: RawSkillLevel }): SkillRecord {
  const raw = structuredClone(skill.raw)
  return { id: `${operatorId}/${skill.skillIndex}`, operatorId, operatorName, skillId: skill.skillId,
    skillIndex: skill.skillIndex, skillName: raw.name!, profession: 'WARRIOR', professionLabel: '前衛', rarity: 6,
    subProfessionId, subProfessionName: subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!,
    classification: classifySkill(raw), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(profile) }
}
const catalog = sources.guards.flatMap(operator => operator.skills.map(skill => makeRecord(operator.id, operator.name,
  operator.subProfessionId, profiles.find(value => value.operatorId === operator.id)!.operatorProfile, skill)))
const coverage = buildStructureCoverage(catalog)
const record = (id: string, skillIndex = 1) => structuredClone(catalog.find(row => row.operatorId === id && row.skillIndex === skillIndex)!)

test('スキル・素質枠・OP特性を異なる単位で数え、スキル数や複数大分類で重複しない', () => {
  assert.equal(coverage.skill.length, 90)
  assert.equal(coverage.talent.length, 60)
  assert.equal(coverage.trait.length, 30)
  for (const kind of ['skill', 'talent', 'trait'] as const) {
    const rows = coverage[kind]
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length)
    assert.equal(summarizeStructureCoverage(rows).rate, 100)
    assert.deepEqual(buildStructureCoverage([...catalog, ...catalog])[kind], rows)
  }
  assert.ok(coverage.skill.some(row => row.categoryLabels.length > 1))
  const surtr = coverage.skill.find(row => row.operatorId === 'char_350_surtr' && row.number === 3)!
  assert.deepEqual(parseHashRoute(surtr.structureHref!), { view: 'skill-structure',
    selection: { operatorId: 'char_350_surtr', skillId: 'skchr_surtr_3', skillIndex: 3, levelIndex: 9 } })
})

test('保留がある構造も登録済みとして数え、保留事項は独立して参照できる', () => {
  const surtr = coverage.skill.find(row => row.operatorId === 'char_350_surtr' && row.number === 3)!
  assert.equal(surtr.registered, true)
  assert.ok(surtr.concerns.some(value => value.title === 'HP減少の時間変化と処理時刻'))
  const noteSkill = coverage.skill.find(row => row.operatorId === 'char_4182_oblvns' && row.number === 2)!
  assert.equal(noteSkill.registered, true)
  assert.ok(noteSkill.concerns.some(value => value.detail.includes('命中頻度')))
  const poison = coverage.talent.find(row => row.operatorId === 'char_293_thorns' && row.number === 1)!
  assert.equal(poison.registered, true)
  assert.ok(poison.concerns.some(value => value.detail.includes('初回ダメージの時刻')))
  const skadi = coverage.skill.find(row => row.operatorId === 'char_263_skadi' && row.number === 1)!
  assert.deepEqual(skadi.concerns, [])
})

test('特性のPARTIALはissuesが空でも保留事項を持ち、通常の説明メモを全て保留とはしない', () => {
  const raw = buildTraitStructures(catalog).find(row => row.basicInfo.operatorId === 'char_4064_mlynar')!
  assert.equal(raw.status, 'PARTIAL')
  assert.equal(raw.issues.length, 0)
  const trait = coverage.trait.find(row => row.operatorId === 'char_4064_mlynar')!
  assert.ok(trait.concerns.some(value => value.detail.includes('補間方式')))
  const ordinary = coverage.talent.find(row => row.operatorId === 'char_263_skadi' && row.number === 1)!
  assert.deepEqual(ordinary.concerns, [])
})

test('登録元と現行の素質・特性データが不一致でも未登録に変えず、確認事項として残す', () => {
  const altered = record('char_350_surtr')
  for (const talent of altered.operatorProfile.talents ?? []) for (const candidate of talent.candidates ?? []) {
    candidate.name = '別の素質名'
  }
  altered.operatorProfile.traitDescription = '以前と異なる特性'
  altered.operatorProfile.subProfessionTraitDescription = '以前と異なる特性'
  altered.operatorProfile.trait = undefined
  const result = buildStructureCoverage([altered])
  assert.equal(result.talent.length, 2)
  assert.ok(result.talent.every(row => row.registered && row.concerns.some(value => value.title === 'データの確認')))
  assert.equal(result.trait[0].registered, true)
  assert.ok(result.trait[0].concerns.some(value => value.detail.includes('一致しません')))
})

test('未登録スキル・素質も母数に含み、同じ職分の特性は共通定義で登録済みになる', () => {
  const unknown = { ...record('char_350_surtr'), operatorId: 'char_unregistered_fixture', operatorName: '未登録テスト' }
  const result = buildStructureCoverage([record('char_350_surtr'), unknown])
  assert.deepEqual(summarizeStructureCoverage(result.skill), { total: 2, registered: 1, unregistered: 1, rate: 50 })
  assert.deepEqual(summarizeStructureCoverage(result.talent), { total: 4, registered: 2, unregistered: 2, rate: 50 })
  assert.deepEqual(summarizeStructureCoverage(result.trait), { total: 2, registered: 2, unregistered: 0, rate: 100 })
  const unregistered = result.skill.find(row => row.operatorId === unknown.operatorId)!
  assert.equal(unregistered.structureHref, undefined)
  assert.deepEqual(unregistered.concerns, [])
})

test('最高段階がLv7の構造へも正しい段階で遷移する', () => {
  const operator = EXPANDED_OPERATOR_SOURCES.find(value => value.rarity === 3)!
  assert.ok(operator)
  const source = makeRecord(operator.operatorId, operator.operatorName, operator.subProfessionId, operator.profile, operator.skills[0])
  source.skillLevels = Array.from({ length: 7 }, () => structuredClone(source.raw))
  const result = buildStructureCoverage([source]).skill[0]
  assert.equal(result.registered, true)
  assert.match(result.structureHref!, /levelIndex=6$/)
})

test('検索・職業・レアリティ・登録状態を組み合わせても全体集計を変更しない', () => {
  const original = summarizeStructureCoverage(coverage.skill)
  const filtered = filterStructureCoverage(coverage.skill, { ...DEFAULT_STRUCTURE_COVERAGE_FILTERS,
    query: 'スルト Ｓ３', profession: 'WARRIOR', rarity: 6, registration: 'REGISTERED' })
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].operatorId, 'char_350_surtr')
  assert.equal(filtered[0].number, 3)
  assert.equal(filterStructureCoverage(coverage.skill, { ...DEFAULT_STRUCTURE_COVERAGE_FILTERS, profession: 'CASTER' }).length, 0)
  assert.equal(filterStructureCoverage(coverage.skill, { ...DEFAULT_STRUCTURE_COVERAGE_FILTERS, rarity: 3 }).length, 0)
  assert.equal(filterStructureCoverage(coverage.skill, { ...DEFAULT_STRUCTURE_COVERAGE_FILTERS, registration: 'UNREGISTERED' }).length, 0)
  assert.equal(filterStructureCoverage(coverage.talent, { ...DEFAULT_STRUCTURE_COVERAGE_FILTERS, query: 'ソーンズ 素質1' }).length, 1)
  assert.deepEqual(summarizeStructureCoverage(coverage.skill), original)
})

test('空のデータでは未登録0・登録率なしとし、0%の登録率と区別する', () => {
  const empty = buildStructureCoverage([])
  assert.deepEqual(empty, { skill: [], talent: [], trait: [] })
  assert.deepEqual(summarizeStructureCoverage([]), { total: 0, registered: 0, unregistered: 0, rate: null })
  const unknown = { ...record('char_350_surtr'), operatorId: 'char_unregistered_fixture' }
  assert.equal(summarizeStructureCoverage(buildStructureCoverage([unknown]).skill).rate, 0)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { getDamageCalculatorThreeStructures } from '../src/lib/damageCalculatorThree.ts'
import { getDamageThreeAttributeEntries } from '../src/lib/damageCalculatorThreeAttributeComparison.ts'
import { evaluateDamageThreeSkillRankRow } from '../src/lib/damageThreeSkillRankMatrix.ts'
import { evaluateSkillRankStatisticsStage, summarizeSkillRankStatistics } from '../src/lib/damageThreeSkillRankStatistics.ts'
import { evaluateDamageThreeComparisonEntry, type DamageThreeComparisonOverrides } from '../src/lib/damageCalculatorThreeComparison.ts'
import {
  evaluateAttackAttributeTables,
  evaluateDamageThreeAttributeRankTable,
  evaluateDamageThreeAttributeTables,
  getDamageThreeMainAttackDetails,
  type DamageThreeAttributeTableRow,
  type DamageThreeAttributeTablesInput,
} from '../src/lib/damageCalculatorThreeAttributeTables.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const guards = json<{ guards: { id: string; name: string; subProfessionId: string;
  skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[] }>('./fixtures/sixStarGuardSources.json').guards
const profiles = json<{ operatorId: string; operatorProfile: OperatorCombatProfile }[]>('./fixtures/sixStarGuardProfiles.json')
const sources = ['Melee', 'Ranged', 'Arts', 'Caster', 'Support', 'Special', 'Elemental', 'Summon'].flatMap(group => json<ExpandedOperatorSource[]>(`../src/data/expanded${group}Sources.json`))
const catalog: SkillRecord[] = [...guards.map(source => ({ operatorId: source.id, operatorName: source.name,
  profession: 'WARRIOR', rarity: 6, subProfessionId: source.subProfessionId, skillLevelIndex: 9,
  profile: profiles.find(profile => profile.operatorId === source.id)!.operatorProfile, skills: source.skills })), ...sources]
  .flatMap(source => source.skills.map(skill => {
    const raw = structuredClone(skill.raw)
    return { id: `${source.operatorId}/${skill.skillIndex}`, operatorId: source.operatorId,
      operatorName: source.operatorName, skillId: skill.skillId, skillIndex: skill.skillIndex, skillName: raw.name!,
      profession: source.profession, professionLabel: source.profession, rarity: source.rarity,
      subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
      description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
      spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
      skillLevels: Array.from({ length: source.skillLevelIndex + 1 }, () => structuredClone(raw)), raw,
      operatorProfile: structuredClone(source.profile), overrideTokenKey: source.profile.summonSkillTokenKeys?.[skill.skillIndex - 1] ?? undefined,
    }
  }))
const entries = getDamageThreeAttributeEntries(catalog)
function input(id: string, index: number, stageId?: string, overrides?: DamageThreeComparisonOverrides): DamageThreeAttributeTablesInput {
  const entry = entries.find(entry => entry.skill.operatorId === id && entry.skill.skillIndex === index
    && (stageId === undefined || entry.stageId === stageId))
  assert.ok(entry, `${id}/S${index}/${stageId ?? '*'}`)
  return { entry, enemyCount: 1, overrides }
}
function assertRatingRows({ physical, arts }: ReturnType<typeof evaluateAttackAttributeTables>) {
  const ratings = ['E', 'D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS']
  assert.deepEqual(physical.map(row => row.rating), ratings)
  assert.deepEqual(arts.map(row => row.rating), ratings)
  assert.deepEqual(physical.map(row => [row.minStat, row.maxStat]), [
    [0, 99], [100, 199], [200, 499], [500, 799], [800, 999],
    [1000, 1199], [1200, 1999], [2000, 2999], [3000, 5000], [5001, null],
  ])
  assert.deepEqual(arts.map(row => [row.minStat, row.maxStat]), [
    [0, 0], [1, 9], [10, 19], [20, 29], [30, 49],
    [50, 59], [60, 69], [70, 79], [80, 90], [91, 100],
  ])
}
function isFiniteRange(range: DamageThreeAttributeTableRow['perAttack']) {
  return range !== null && Number.isFinite(range.min) && Number.isFinite(range.max)
    && range.min >= 0 && range.min <= range.max
}
function valid(value: DamageThreeAttributeTablesInput) {
  const output = evaluateDamageThreeAttributeTables(value)
  assert.deepEqual(output.errors, [], value.entry.key)
  assertRatingRows(output)
  assert.ok([...output.physical, ...output.arts].every(row => isFiniteRange(row.perAttack)))
  return output
}
function* endpoints(rows: readonly DamageThreeAttributeTableRow[]) {
  for (const row of rows) {
    yield { stat: row.minStat, perAttack: row.perAttack?.max ?? null, dps: row.dps?.max ?? null }
    if (row.maxStat !== null && row.maxStat !== row.minStat) {
      yield { stat: row.maxStat, perAttack: row.perAttack?.min ?? null, dps: row.dps?.min ?? null }
    }
  }
}
function ordinary(value: DamageThreeAttributeTablesInput, type: 'PHYSICAL' | 'ARTS', axis: number) {
  return evaluateDamageThreeComparisonEntry(value.entry, { enemyCount: value.enemyCount,
    defense: type === 'PHYSICAL' ? axis : 0, resistance: type === 'ARTS' ? axis : 0 }, value.overrides,
  { operatorLevel: value.operatorLevel, trust: value.trust, virtualMainAttackType: type })
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) <= 1e-7 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
}

test('術耐性別の要約には1攻撃単位の段階を使い、主攻撃を属性変更した表と同じ値を返す', () => {
  const pairs = [{ resistance: 60, defense: 1200, percentage: 4, rankCutoff: 1 }]
  const mountain = input('char_264_f12yin', 2).entry
  assert.deepEqual(evaluateSkillRankStatisticsStage(mountain, pairs), evaluateDamageThreeSkillRankRow(mountain, pairs, 'virtual').cells)
  assert.equal(evaluateSkillRankStatisticsStage(input('char_010_chen', 2).entry, pairs), null)
})

test('スルトS2の術耐性20無視の切り替えが属性変更・実際の内訳・術耐性別の統計に反映される', () => {
  const entry = input('char_350_surtr', 2).entry
  const pairs = [{ resistance: 60, defense: 1200, percentage: 4, rankCutoff: 1 }]
  for (const mode of ['virtual', 'actual'] as const) {
    const on = evaluateDamageThreeSkillRankRow(entry, pairs, mode)
    const off = evaluateDamageThreeSkillRankRow(entry, pairs, mode, true)
    assert.deepEqual(evaluateDamageThreeSkillRankRow(entry, pairs, mode, 'apply'), on)
    assert.deepEqual(evaluateDamageThreeSkillRankRow(entry, pairs, mode, 'excludePenetration'), off)
    assert.deepEqual([...on.errors, ...off.errors], [])
    assert.ok(on.cells[0].arts! > 0)
    close(off.cells[0].arts, on.cells[0].arts! * (0.4 / 0.6))
    assert.equal(off.cells[0].physical, on.cells[0].physical)
    if (mode === 'virtual') {
      assert.deepEqual(evaluateSkillRankStatisticsStage(entry, pairs), on.cells)
      assert.deepEqual(evaluateSkillRankStatisticsStage(entry, pairs, true), off.cells)
    }
  }
})

test('各条件の共通有効段階から四分位数と丸め前の勝敗を求め、対応値のない列は空にする', () => {
  const pairs = [
    { resistance: 50, defense: 300, percentage: 16, rankCutoff: 10 },
    { resistance: 0, defense: 0, percentage: 100, rankCutoff: 20 },
    { resistance: 100, defense: null, percentage: 0, rankCutoff: 0 },
  ]
  const cell = (physical: number | null, arts: number | null) => ({ physical, arts })
  const skill = { operatorId: 'operator-a', skillIndex: 1, skillId: 'shared' }
  const stages = [
    { skill, cells: [cell(6, 4), cell(10, 10 + 1e-10), cell(0, 0)] },
    { skill: { ...skill, operatorId: 'operator-b' }, cells: [cell(2, 10), cell(2.24, 2.25), cell(0, 0)] },
    { skill: { ...skill, skillIndex: 2 }, cells: [cell(0, 0), cell(Infinity, 1), cell(null, null)] },
    { skill: { ...skill }, cells: [cell(4, 6), cell(30, NaN), cell(null, null)] },
    { skill: { ...skill, skillId: 'uncalculable' }, cells: [cell(null, 100), cell(20, null), cell(null, null)] },
  ]
  const [first, second, missing] = summarizeSkillRankStatistics(pairs, stages.values())
  assert.deepEqual(first, {
    resistance: 50, defense: 300, count: 4,
    physical: { q1: 1.5, median: 3, q3: 4.5 }, arts: { q1: 3, median: 5, q3: 7 },
    physicalWins: 1, ties: 1, artsWins: 2,
    bySkill: { count: 3, physicalWins: 0.5, ties: 1, artsWins: 1.5 },
  })
  assert.equal(second.count, 2)
  assert.deepEqual([second.physicalWins, second.ties, second.artsWins], [0, 1, 1])
  assert.deepEqual(second.bySkill, { count: 2, physicalWins: 0, ties: 1, artsWins: 1 })
  assert.deepEqual(missing, {
    resistance: 100, defense: null, count: 0, physical: null, arts: null, physicalWins: 0, ties: 0, artsWins: 0,
    bySkill: { count: 0, physicalWins: 0, ties: 0, artsWins: 0 },
  })
})

test('スキル別の行は元の混合攻撃の内訳と主攻撃の属性変更を区別し、空の順位を保つ', () => {
  const entry = input('char_010_chen', 2).entry
  const pairs = [
    { resistance: 50, defense: 300, percentage: 16 },
    { resistance: 100, defense: null, percentage: 0 },
  ]
  const actual = evaluateDamageThreeSkillRankRow(entry, pairs, 'actual')
  assert.deepEqual(actual.errors, [])
  assert.ok(actual.cells[0].physical! > 0 && actual.cells[0].arts! > 0)
  const base = evaluateDamageThreeComparisonEntry(entry, { enemyCount: 1, defense: 300, resistance: 50 })
  close(actual.cells[0].physical! + actual.cells[0].arts!, base.perAttack!)
  const virtual = evaluateDamageThreeSkillRankRow(entry, pairs, 'virtual')
  assert.deepEqual(virtual.errors, [])
  assert.deepEqual(virtual.cells, evaluateDamageThreeAttributeRankTable({ entry, enemyCount: 1 }, pairs)
    .rows.map(({ physical, arts }) => ({ physical, arts })))
  assert.notDeepEqual(actual.cells[0], virtual.cells[0])
  assert.deepEqual(actual.cells[1], { physical: null, arts: null })
})

test('単属性・追加攻撃・継続のみを持つスキルの直接ダメージを区別する', () => {
  const pair = { resistance: 60, defense: 1200, percentage: 4 }
  for (const [id, skillIndex, expectedType] of [
    ['char_350_surtr', 3, 'arts'], ['char_103_angel', 3, 'physical'],
    ['char_2013_cerber', 2, 'arts'], ['char_355_ethan', 1, 'physical'],
  ] as const) {
    const entry = input(id, skillIndex).entry
    const actual = evaluateDamageThreeSkillRankRow(entry, [pair], 'actual')
    const base = evaluateDamageThreeComparisonEntry(entry, { ...pair, enemyCount: 1 })
    assert.deepEqual(actual.errors, [], entry.key)
    close(actual.cells[0][expectedType], base.perAttack!)
    assert.equal(actual.cells[0][expectedType === 'arts' ? 'physical' : 'arts'], 0)
  }
  const onlyPeriodic = evaluateDamageThreeSkillRankRow(input('char_134_ifrit', 3).entry, [pair], 'actual')
  assert.deepEqual(onlyPeriodic.cells, [{ physical: null, arts: null }])
  assert.ok(onlyPeriodic.errors.length)
  assert.equal(onlyPeriodic.isExpectedValue, false)
  assert.equal(onlyPeriodic.hasUnsupportedTalentDamage, false)
})

test('属性別の行は期待値と未対応の素質を別々に判定する', () => {
  function assertStatus(row: ReturnType<typeof evaluateDamageThreeSkillRankRow>, expectedValue: boolean, unsupportedTalent: boolean) {
    assert.equal(row.isExpectedValue, expectedValue)
    assert.equal(row.hasUnsupportedTalentDamage, unsupportedTalent)
  }
  const pairs = [{ resistance: 50, defense: 300, percentage: 16 }]
  const provence = input('char_145_prove', 1).entry
  const surtr = input('char_350_surtr', 3).entry
  for (const mode of ['actual', 'virtual'] as const) {
    assertStatus(evaluateDamageThreeSkillRankRow(provence, pairs, mode), true, false)
    assertStatus(evaluateDamageThreeSkillRankRow(surtr, pairs, mode), false, false)
    assertStatus(evaluateDamageThreeSkillRankRow(provence, [{ ...pairs[0], defense: null }], mode), false, false)
  }
  const executor = input('char_1032_excu2', 1).entry
  assertStatus(evaluateDamageThreeSkillRankRow(executor, pairs, 'actual'), true, false)
  assertStatus(evaluateDamageThreeSkillRankRow(executor, pairs, 'virtual'), false, false)
  const thorns = structuredClone(input('char_293_thorns', 3, 'second_and_later').entry)
  for (const candidate of thorns.skill.operatorProfile.talents![0].candidates!) {
    candidate.blackboard = candidate.blackboard!.filter(item => item.key !== 'damage[normal]')
  }
  assertStatus(evaluateDamageThreeSkillRankRow(thorns, pairs, 'actual'), false, true)
  assertStatus(evaluateDamageThreeSkillRankRow(thorns, pairs, 'virtual'), false, false)
})

test('出現順位別の物理・術を同じ防御力と術耐性で計算し、弱点判定を維持する', () => {
  const pair = { resistance: 60, defense: 1000, percentage: 10 }
  const exusiai = evaluateDamageThreeAttributeRankTable(input('char_103_angel', 3), [pair])
  assert.deepEqual(exusiai.errors, [])
  assert.deepEqual(exusiai.rows[0], { ...pair, physical: 183.425, arts: 1467.4 })

  const chen = evaluateDamageThreeAttributeRankTable(input('char_1050_chen3', 1, 'active'), [pair])
  assert.deepEqual(chen.errors, [])
  assert.deepEqual(chen.rows[0], { ...pair, physical: 1588, arts: 1588 })
})

test('出現順位別でも防御力由来の追加攻撃を除外し、無視効果の設定を適用する', () => {
  const pair = { resistance: 20, defense: 500, percentage: 60 }
  const ceobeInput = input('char_2013_cerber', 2)
  const ceobe = evaluateDamageThreeAttributeRankTable(ceobeInput, [pair])
  assert.deepEqual(ceobe.errors, [])
  for (const [type, damage] of [['PHYSICAL', ceobe.rows[0].physical], ['ARTS', ceobe.rows[0].arts]] as const) {
    const result = evaluateDamageThreeComparisonEntry(ceobeInput.entry, { ...pair, enemyCount: 1 }, {}, { virtualMainAttackType: type })
    assert.deepEqual(result.errors, [])
    const main = result.output!.rows[0].attackComponents.filter(component => component.role === 'MAIN')
    close(damage, main.reduce((sum, component) => sum + component.expectedDamage, 0))
    assert.ok(damage! < result.perAttack!)
  }

  const surtr = input('char_350_surtr', 2)
  const on = evaluateDamageThreeAttributeRankTable(surtr, [pair])
  const off = evaluateDamageThreeAttributeRankTable({ ...surtr, disablePenetration: true }, [pair])
  assert.deepEqual([...on.errors, ...off.errors], [])
  assert.equal(off.rows[0].physical, on.rows[0].physical)
  close(off.rows[0].arts, on.rows[0].arts! * 0.8)
})

test('出現順位別の表は対応なし・計算エラー・正常な0ダメージを区別する', () => {
  const validPair = { resistance: 60, defense: 1000, percentage: 10 }
  const missingPair = { resistance: 100, defense: null, percentage: 0 }
  const invalidPair = { resistance: 101, defense: 2000, percentage: 0 }
  const value = input('char_456_ash', 3, undefined, { 'guard.contactHit': false, 'guard.explosionHit': false })
  const noMatch = evaluateDamageThreeAttributeRankTable(value, [missingPair])
  assert.deepEqual(noMatch.errors, [])
  assert.deepEqual(noMatch.rows, [{ ...missingPair, physical: null, arts: null }])

  const rows = evaluateDamageThreeAttributeRankTable(value, [invalidPair, missingPair, validPair])
  assert.ok(rows.errors.some(error => error.includes('術耐性')))
  assert.deepEqual(rows.rows, [
    { ...invalidPair, physical: null, arts: null },
    { ...missingPair, physical: null, arts: null },
    { ...validPair, physical: 0, arts: 0 },
  ])

  const periodic = evaluateDamageThreeAttributeRankTable(input('char_134_ifrit', 3), [validPair])
  assert.deepEqual(periodic.errors, ['継続ダメージのみの段階は、1回の攻撃ダメージを表示できません。'])
  assert.deepEqual(periodic.rows, [{ ...validPair, physical: null, arts: null }])
})

test('攻撃力のみの属性比較は評価の境界と最低保証を使って一撃ダメージの範囲を求める', () => {
  const { physical, arts } = evaluateAttackAttributeTables(1000)
  assertRatingRows({ physical, arts })
  assert.deepEqual(physical.find(row => row.rating === 'B+')!.perAttack, { min: 50, max: 200 })
  assert.deepEqual(arts[0].perAttack, { min: 1000, max: 1000 })
  const artsSs = arts.at(-1)!.perAttack!
  assert.equal(artsSs.min, 50)
  close(artsSs.max, 90)
  assert.ok([...physical, ...arts].every(row => row.dps === null))

  const highAttack = evaluateAttackAttributeTables(1_000_000)
  assert.deepEqual(highAttack.physical.at(-1)!.perAttack, { min: 50_000, max: 994_999 })
})

test('攻撃力のみの属性比較は指定範囲の端点で計算し、評価との重なりが1点でも保持する', () => {
  const { physical, arts } = evaluateAttackAttributeTables(1600, {
    defense: { min: 80, max: 120 },
    resistance: { min: 10, max: 20 },
  })
  assert.deepEqual(physical.map(({ rating, minStat, maxStat, perAttack }) => [rating, minStat, maxStat, perAttack]), [
    ['E', 80, 99, { min: 1501, max: 1520 }],
    ['D', 100, 120, { min: 1480, max: 1500 }],
  ])
  assert.deepEqual(arts.map(({ rating, minStat, maxStat }) => [rating, minStat, maxStat]), [
    ['C', 10, 19], ['B', 20, 20],
  ])
  close(arts[0].perAttack!.min, 1296)
  close(arts[1].perAttack!.max, 1280)

  const highDefense = evaluateAttackAttributeTables(1_000_000, {
    defense: { min: 6000, max: 7000 },
    resistance: { min: 0, max: 100 },
  })
  assert.deepEqual(highDefense.physical[0].perAttack, { min: 993_000, max: 994_000 })
})

test('無視オフはスルトS2の術耐性20無視だけを外し、物理側と攻撃間隔を保つ', () => {
  const value = input('char_350_surtr', 2)
  const on = valid(value)
  const off = valid({ ...value, disablePenetration: true })
  const before = on.arts.find(row => row.rating === 'B')!
  const after = off.arts.find(row => row.rating === 'B')!
  const base = on.arts[0].perAttack!.max

  assert.deepEqual(off.physical, on.physical)
  assert.equal(off.reference.output!.attackInterval, on.reference.output!.attackInterval)
  close(before.perAttack!.max, base)
  close(after.perAttack!.max, base * 0.8)
  close(after.perAttack!.min, base * 0.71)
  close(after.dps!.max, after.perAttack!.max / off.reference.output!.attackInterval!)
})

test('無視オフはアイリーニS1の地上敵への確率防御無視を外し、2ヒットを保つ', () => {
  const value = input('char_4009_irene', 1, undefined, { targetCanBeLevitated: false })
  const on = valid(value)
  const off = valid({ ...value, disablePenetration: true })
  const base = on.physical[0].perAttack!.max
  const before = on.physical.find(row => row.rating === 'B')!
  const after = off.physical.find(row => row.rating === 'B')!

  close(before.perAttack!.max, base - 2 * 500 * (1 - 0.5 * 0.5))
  close(after.perAttack!.max, base - 2 * 500)
  assert.deepEqual(off.arts, on.arts)
})

test('聖聆プラマニクスS3の凍結中は、適用・無視のみ除外・属性限定効果を除外で術の軽減率が変わる', () => {
  const value = input('char_1046_sbell2', 3, 'attack', { 'guard.sbellTargetFrozen': true })
  const on = valid(value)
  const off = valid({ ...value, disablePenetration: true })
  const neutral = valid({ ...value, excludeAttributeEffects: true })
  const base = on.arts[0].perAttack!.max
  const before = on.arts.find(row => row.rating === 'A+')!
  const after = off.arts.find(row => row.rating === 'A+')!

  close(before.perAttack!.max, base * (1 - (60 - 15 - 10) / 100))
  close(after.perAttack!.max, base * (1 - (60 - 15) / 100))
  close(neutral.arts.find(row => row.rating === 'A+')!.perAttack!.max, base * 0.4)
  assert.deepEqual(neutral.physical, on.physical)
})

test('ロゴスS1の術耐性低下と術の固定加算を外すと、敵防御と術耐性0で集計も横並びの表も同値になる', () => {
  const entry = input('char_4133_logos', 1, 'attack').entry
  const pairs = [
    { resistance: 0, defense: 0, percentage: 100, rankCutoff: 2 },
    { resistance: 40, defense: 300, percentage: 20, rankCutoff: 1 },
  ]
  for (const policy of ['apply', 'excludePenetration', 'excludeAttributeEffects'] as const) {
    const result = evaluateDamageThreeSkillRankRow(entry, pairs, 'virtual', policy)
    assert.deepEqual(result.errors, [])
    const [zero, resisted] = result.cells
    assert.ok(zero.physical !== null && zero.physical > 300)
    const base = zero.physical
    const neutral = policy === 'excludeAttributeEffects'
    close(zero.arts, neutral ? base : base + 150)
    close(resisted.physical, base - 300)
    close(resisted.arts, neutral ? base * 0.6 : (base + 150) * 0.7)
    const cells = evaluateSkillRankStatisticsStage(entry, pairs, policy)
    assert.deepEqual(cells, result.cells)
    assert.ok(cells)
    const [summary] = summarizeSkillRankStatistics(pairs, [{ skill: entry.skill, cells }])
    assert.deepEqual(summary.bySkill, { count: 1, physicalWins: 0, ties: neutral ? 1 : 0, artsWins: neutral ? 0 : 1 })
  }
})

test('シーS2の低HPへの術限定1.3倍を外し、共通の積墨・スキルの攻撃力を維持する', () => {
  const value = input('char_2015_dusk', 2, undefined, { 'guard.duskKillStacks': 15, 'guard.targetHpPercent': 50 })
  const pairs = [{ defense: 0, resistance: 0, percentage: 100 }, { defense: 300, resistance: 40, percentage: 10 }]
  const on = evaluateDamageThreeAttributeRankTable(value, pairs)
  const neutral = evaluateDamageThreeAttributeRankTable({ ...value, excludeAttributeEffects: true }, pairs)
  assert.deepEqual([...on.errors, ...neutral.errors], [])
  const base = on.rows[0].physical
  assert.ok(base !== null && base > 300)
  close(on.rows[1].arts, base * 0.6 * 1.3)
  close(neutral.rows[1].arts, base * 0.6)
  close(neutral.rows[1].physical, base - 300)
})

test('物理・術それぞれに限定された素質倍率を外し、反対属性のダメージを保つ', () => {
  const pairs = [{ defense: 0, resistance: 0, percentage: 100 }]
  for (const [operatorId, skillIndex, boostedType, multiplier] of [
    ['char_1502_crosly', 1, 'physical', 1.2],
    ['char_1020_reed2', 3, 'arts', 1.3],
  ] as const) {
    const entry = input(operatorId, skillIndex).entry
    const applied = evaluateDamageThreeSkillRankRow(entry, pairs, 'virtual', 'apply')
    const neutral = evaluateDamageThreeSkillRankRow(entry, pairs, 'virtual', 'excludeAttributeEffects')
    assert.deepEqual([...applied.errors, ...neutral.errors], [])
    const baseline = applied.cells[0][boostedType === 'arts' ? 'physical' : 'arts']
    assert.ok(baseline !== null && baseline > 0)
    close(applied.cells[0][boostedType], baseline * multiplier)
    close(neutral.cells[0].physical, baseline)
    close(neutral.cells[0].arts, baseline)
  }
})

test('プラマニクスS2の防御・術耐性低下を外しても、両属性共通の低HP脆弱は残る', () => {
  const value = input('char_174_slbell', 2, undefined, { 'guard.targetHpPercent': 30 })
  const pairs = [{ defense: 100, resistance: 80, percentage: 1 }]
  const on = evaluateDamageThreeAttributeRankTable(value, pairs)
  const neutral = evaluateDamageThreeAttributeRankTable({ ...value, excludeAttributeEffects: true }, pairs)
  assert.deepEqual([...on.errors, ...neutral.errors], [])
  const base = on.reference.output!.stats.attack
  close(on.rows[0].physical, (base - 100 * 0.4) * 1.3)
  close(neutral.rows[0].physical, (base - 100) * 1.3)
  close(on.rows[0].arts, base * 0.44 * 1.3)
  close(neutral.rows[0].arts, base * 0.2 * 1.3)
})

test('無視オフはEla S2の防御800無視を外し、会心確率と倍率を保つ', () => {
  const value = input('char_4123_ela', 2, undefined, { 'guard.elaTargetState': 'GROUND' })
  const on = valid(value)
  const off = valid({ ...value, disablePenetration: true })
  const base = on.reference.output!.stats.attack
  const before = on.physical.find(row => row.rating === 'C')!
  const after = off.physical.find(row => row.rating === 'C')!

  close(before.perAttack!.max, base * 0.7 + base * 1.5 * 0.3)
  close(after.perAttack!.max, (base - 200) * 0.7 + (base * 1.5 - 200) * 0.3)
})

test('エクシアS3の主攻撃をゲーム内評価の両端で比較し、5連撃・攻撃間隔・最低保証を保つ', () => {
  const value = input('char_103_angel', 3)
  const before = structuredClone(value)
  const output = valid(value)
  const native = evaluateDamageThreeComparisonEntry(value.entry, { defense: 0, resistance: 0, enemyCount: 1 })
  assert.deepEqual(output.reference, native)
  assert.equal(output.canShowDps, true)
  const perHit = native.output!.rows[0].attackComponents[0].attackPipeline.finalAttack
  const interval = native.output!.attackInterval!
  for (const point of endpoints(output.physical)) {
    close(point.perAttack, Math.max(perHit - point.stat, perHit * 0.05) * 5)
    close(point.dps, point.perAttack! / interval)
  }
  for (const point of endpoints(output.arts)) {
    close(point.perAttack, perHit * Math.max(1 - point.stat / 100, 0.05) * 5)
    close(point.dps, point.perAttack! / interval)
  }
  assert.deepEqual(output.arts[0].perAttack, { min: perHit * 5, max: perHit * 5 })
  close(output.physical.at(-1)?.perAttack?.min ?? null, perHit * 0.05 * 5)
  assert.deepEqual(value, before)
})

test('防御力SSの下限は防御力5,001で最低保証に達していない主攻撃でも正しく求める', () => {
  const value = structuredClone(input('char_103_angel', 3))
  const frames = value.entry.skill.operatorProfile.phases[value.entry.phaseIndex].attributesKeyFrames
  assert.ok(frames?.length)
  for (const frame of frames) {
    assert.ok(frame.data)
    frame.data.atk = 20_000
  }
  const ss = valid(value).physical.at(-1)!
  const lowDefense = ordinary(value, 'PHYSICAL', 5001)
  const floorDefense = ordinary(value, 'PHYSICAL', 100_000)
  assert.deepEqual(lowDefense.errors, [])
  assert.deepEqual(floorDefense.errors, [])
  assert.ok(lowDefense.perAttack! > floorDefense.perAttack!)
  assert.equal(ss.maxStat, null)
  assert.deepEqual(ss.perAttack, { min: floorDefense.perAttack, max: lowDefense.perAttack })
  assert.deepEqual(ss.dps, { min: floorDefense.dps, max: lowDefense.dps })
})

test('弱点判定で術属性へ切り替わった枝はDEFに依存せず、防御力SSの下限を確定できる', () => {
  for (const [index, stage] of [[1, 'active'], [2, 'slashes'], [2, 'normal'], [3, 'normal']] as const) {
    const value = input('char_1050_chen3', index, stage)
    const result = valid(value), ss = result.physical.at(-1)!
    const atLower = ordinary(value, 'PHYSICAL', 5001), atHigher = ordinary(value, 'PHYSICAL', 1000000)
    assert.deepEqual(atLower.errors, [])
    assert.deepEqual(atHigher.errors, [])
    const main = atHigher.output!.rows[0].attackComponents.filter(component => component.role === 'MAIN')
    assert.ok(main.length > 0 && main.every(component => component.damageType === 'ARTS'))
    const expected = main.reduce((sum, component) => sum + component.attackPipeline.finalAttack * component.count, 0)
    close(atHigher.perAttack, expected)
    assert.deepEqual(ss.perAttack, { min: expected, max: atLower.perAttack })
    close(atLower.perAttack, atHigher.perAttack!)
  }
})

test('主攻撃のみを抽出し、ケオベのDEF由来術追撃とムリナール・チューバイの追加攻撃を除く', () => {
  for (const value of [input('char_2013_cerber', 2), input('char_4064_mlynar', 3), input('char_4082_qiubai', 1)]) {
    const output = valid(value)
    for (const [type, rows] of [['PHYSICAL', output.physical], ['ARTS', output.arts]] as const) {
      for (const point of endpoints(rows)) {
        const full = ordinary(value, type, point.stat)
        const components = full.output!.rows[0].attackComponents
        const main = components.filter(component => component.role === 'MAIN').reduce((sum, component) => sum + component.expectedDamage, 0)
        const extra = components.filter(component => component.role === 'ADDITIONAL').reduce((sum, component) => sum + component.expectedDamage, 0)
        close(point.perAttack, main)
        close(full.perAttack, main + extra)
        if (extra > 0) assert.ok(point.perAttack! < full.perAttack!)
      }
    }
  }
})

test('主攻撃の内訳にはウィシャデルS3の初撃と余震の軽減前の値だけを表示する', () => {
  const result = evaluateDamageThreeAttributeRankTable(input('char_1035_wisdel', 3), [
    { resistance: 0, defense: 0, percentage: 100 },
  ])
  assert.deepEqual(result.errors, [])
  const details = getDamageThreeMainAttackDetails(result.reference)
  assert.deepEqual(details.map(({ count, expectedHitCount }) => [count, expectedHitCount]), [[1, 1], [1, 1]])
  assert.match(details[0].label, /初撃|攻撃/)
  assert.match(details[1].label, /余震/)
  close(details[0].attack, 5502.75)
  close(details[1].attack, 2751.375)
  close(result.rows[0].physical, details[0].attack! + details[1].attack!)
  assert.ok(result.reference.perAttack! > result.rows[0].physical!)
})

test('旧形式のスルトS2も主攻撃の内訳に1ヒットの軽減前の値を表示する', () => {
  const result = evaluateDamageThreeAttributeRankTable(input('char_350_surtr', 2), [])
  assert.deepEqual(result.errors, [])
  const details = getDamageThreeMainAttackDetails(result.reference)
  assert.equal(details.length, 1)
  assert.equal(details[0].count, 1)
  assert.equal(details[0].expectedHitCount, 1)
  close(details[0].attack, result.reference.perAttack!)
})

test('ウィシャデルの通常攻撃はスキル補正を外し、初撃と余震を別々に軽減する', () => {
  const entry = input('char_1035_wisdel', 3)
  const pairs = [
    { resistance: 0, defense: 0, percentage: 100 },
    { resistance: 60, defense: 1200, percentage: 10 },
  ]
  const normal = evaluateDamageThreeAttributeRankTable({ ...entry, normalAttack: true }, pairs)
  assert.deepEqual(normal.errors, [])
  const hits = getDamageThreeMainAttackDetails(normal.reference)
  assert.deepEqual(hits.map(hit => hit.count), [1, 1])
  assert.match(hits[1].label, /余震/)
  close(hits[0].attack, 893.55)
  close(hits[1].attack, 446.775)
  close(normal.rows[0].physical, 1340.325)
  close(normal.rows[0].arts, 1340.325)
  close(normal.rows[1].physical, 67.01625)
  close(normal.rows[1].arts, 536.13)
  const skill = evaluateDamageThreeAttributeRankTable(entry, pairs)
  close(skill.rows[0].physical, 8254.125)
})

test('スルトの通常攻撃は術耐性無視を選択設定に応じて適用する', () => {
  const value = { ...input('char_350_surtr', 3), normalAttack: true }
  const pairs = [
    { resistance: 0, defense: 0, percentage: 100 },
    { resistance: 40, defense: 200, percentage: 45 },
  ]
  const on = evaluateDamageThreeAttributeRankTable(value, pairs)
  const off = evaluateDamageThreeAttributeRankTable({ ...value, disablePenetration: true }, pairs)
  assert.deepEqual(on.errors, [])
  assert.deepEqual(off.errors, [])
  const baseAttack = on.reference.output!.stats!.attack
  close(on.rows[0].arts, baseAttack)
  close(on.rows[1].arts, baseAttack * 0.8)
  close(off.rows[1].arts, baseAttack * 0.6)
  close(on.rows[1].physical, baseAttack - 200)
  assert.equal(on.rows[1].physical, off.rows[1].physical)
  const rating = valid(value)
  close(rating.arts[0].perAttack!.max, baseAttack)
})

test('guard・旧形式の継続ダメージを除き、通常攻撃と反撃の主攻撃を維持する', () => {
  for (const value of [input('char_355_ethan', 1), input('char_293_thorns', 3), input('char_293_thorns', 2)]) {
    const output = valid(value)
    for (const [type, rows] of [['PHYSICAL', output.physical], ['ARTS', output.arts]] as const) for (const point of endpoints(rows)) {
      const full = ordinary(value, type, point.stat)
      if (output.canShowDps) assert.ok(full.damageOverTimeDps !== null && full.damageOverTimeDps > 0)
      else assert.equal(full.damageOverTimeDps, null, '反撃頻度が未指定のDoTの定常DPSも代用しない')
      close(point.perAttack, full.perAttack!)
      assert.equal(point.dps, full.dps)
      if (output.canShowDps) assert.ok(point.dps! < full.combinedDps!)
      else assert.equal(point.dps, null)
    }
  }
})

test('旧方式5人と単発・順序攻撃・混合・確定主攻撃も同じ集計を使う', () => {
  for (const value of [input('char_350_surtr', 3), input('char_263_skadi', 2), input('char_172_svrash', 3),
    input('char_293_thorns', 1), input('char_4009_irene', 3), input('char_210_stward', 1),
    input('char_010_chen', 2), input('char_002_amiya', 3), input('char_4088_hodrer', 3, 'dot')]) {
    const output = valid(value)
    for (const [type, rows] of [['PHYSICAL', output.physical], ['ARTS', output.arts]] as const) for (const point of endpoints(rows)) {
      const full = ordinary(value, type, point.stat)
      assert.equal(point.perAttack, full.perAttack)
      assert.equal(point.dps, full.dps)
      if (value.entry.kind !== 'NORMAL') assert.equal(point.dps, null)
    }
  }
})

test('トギフォンスS2は遅延爆発を除き、均等な1体あたりの主攻撃を二重に対象数で割らない', () => {
  const single = valid(input('char_363_toddi', 2))
  const value = { ...input('char_363_toddi', 2), enemyCount: 3 }
  const output = valid(value)
  assert.equal(output.reference.actualTargetCount, 3)
  for (let index = 0; index < output.physical.length; index++) {
    for (const bound of ['min', 'max'] as const) {
      close(output.physical[index].perAttack?.[bound] ?? null, single.physical[index].perAttack![bound] / 3)
      close(output.physical[index].dps?.[bound] ?? null, single.physical[index].dps![bound] / 3)
    }
  }
  const full = ordinary(value, 'PHYSICAL', 0)
  assert.ok(full.perAttack! > output.physical[0].perAttack!.max)
})

test('AshS3の両方未命中は正常な0、攻撃を持たない睡眠段階は未対応として区別する', () => {
  const value = input('char_456_ash', 3, undefined, { 'guard.contactHit': false, 'guard.explosionHit': false })
  const output = valid(value)
  assert.deepEqual(output.reference.output!.rows[0].attackComponents, [])
  for (const row of [...output.physical, ...output.arts]) {
    assert.deepEqual(row.perAttack, { min: 0, max: 0 })
    assert.equal(row.dps, null)
  }
  assert.equal(output.canShowDps, false)
  const sleep = evaluateDamageThreeAttributeTables(input('char_4122_grabds', 2, 'sleep'))
  assert.equal(sleep.reference.perAttack, 0)
  assert.ok(sleep.errors.some(error => error.includes('主攻撃がありません')))
  assert.ok([...sleep.physical, ...sleep.arts].every(row => row.perAttack === null && row.dps === null))
})

test('レベル・信頼度・HP状態を両表で共有し、参照結果の条件入力を保持する', () => {
  const value = { ...input('char_405_absin', 1, undefined, { 'guard.targetHpPercent': 20 }), operatorLevel: 1, trust: 0 }
  const output = valid(value)
  assert.ok(output.reference.fields.some(field => field.key === 'guard.targetHpPercent' && field.value === 20))
  assert.deepEqual(output.reference, evaluateDamageThreeComparisonEntry(value.entry,
    { defense: 0, resistance: 0, enemyCount: 1 }, value.overrides, { operatorLevel: 1, trust: 0 }))
  for (const [type, rows] of [['PHYSICAL', output.physical], ['ARTS', output.arts]] as const) for (const point of endpoints(rows)) {
    const full = ordinary(value, type, point.stat)
    assert.equal(point.perAttack, full.perAttack)
    assert.equal(point.dps, full.dps)
  }
  const unweakened = valid({ ...value, overrides: { 'guard.targetHpPercent': 100 } })
  assert.ok(output.arts[0].dps!.max > unweakened.arts[0].dps!.max)
})

test('入力不正・出典不一致・不明な主攻撃を数値で代用せず全行をnullにする', () => {
  const corrupt = structuredClone(input('char_103_angel', 3))
  corrupt.entry.skill.skillLevels[corrupt.entry.levelIndex].blackboard = []
  const unknownRole = structuredClone(input('char_103_angel', 3))
  delete unknownRole.entry.structure.guardRecipe!.stages[0].actions[0].role
  for (const value of [corrupt, unknownRole,
    ...[0, -1, 1.5, NaN, Infinity, 10001].map(enemyCount => ({ ...input('char_103_angel', 3), enemyCount })),
    ...[0, 91, NaN, null as unknown as number].map(operatorLevel => ({ ...input('char_103_angel', 3), operatorLevel })),
    ...[-1, 101, NaN, null as unknown as number].map(trust => ({ ...input('char_103_angel', 3), trust })),
    input('char_1050_chen3', 3, 'wave'),
  ]) {
    const output = evaluateDamageThreeAttributeTables(value)
    assert.ok(output.errors.length, value.entry.key)
    assertRatingRows(output)
    assert.ok([...output.physical, ...output.arts].every(row => row.perAttack === null && row.dps === null))
  }
})

test('全8グループの仮想対応段階は直接攻撃を欠落なく表示し、純周期のみを理由付きで停止する', t => {
  const snapshot = JSON.stringify(getDamageCalculatorThreeStructures())
  const failures: string[] = []
  const periodicOnlyIds: string[] = []
  const kinds = new Set<string>()
  let checked = 0
  for (const entry of entries) {
    const reference = evaluateDamageThreeComparisonEntry(entry, { defense: 0, resistance: 0, enemyCount: 1 })
    if (!entry.capability.supported || reference.errors.length) continue
    const output = evaluateDamageThreeAttributeTables({ entry, enemyCount: 1 })
    const main = entry.structure.guardRecipe?.stages.find(stage => stage.id === entry.stageId)?.actions.filter(action => action.role === 'MAIN') ?? []
    if (main.length > 0 && main.every(action => action.timing === 'PER_SECOND')) {
      assert.deepEqual(output.errors, ['継続ダメージのみの段階は、1回の攻撃ダメージを表示できません。'], entry.key)
      assert.ok([...output.physical, ...output.arts].every(row => row.perAttack === null && row.dps === null), entry.key)
      assert.deepEqual(output.reference, reference)
      periodicOnlyIds.push(entry.key)
      continue
    }
    if (output.errors.length || [...output.physical, ...output.arts].some(row => !isFiniteRange(row.perAttack)
      || (output.canShowDps && !isFiniteRange(row.dps)))) {
      failures.push(`${entry.key}: ${output.errors.join(' / ') || '主攻撃の計算結果なし'}`)
    }
    if (entry.kind !== 'NORMAL' && [...output.physical, ...output.arts].some(row => row.dps !== null)) {
      failures.push(`${entry.key}: 非通常型にDPSが生成された`)
    }
    assert.deepEqual(output.reference, reference)
    kinds.add(entry.kind)
    checked++
  }
  t.diagnostic(`native計算可能・仮想対応 ${checked} 段階、テーブル欠落 ${failures.length}`)
  assert.deepEqual(periodicOnlyIds.sort(), [
    'char_1011_lava2:skchr_lava2_2:9:active', 'char_1012_skadi2:skchr_skadi2_3:9:event',
    'char_1039_thorn2:skchr_thorn2_2:9:active', 'char_1039_thorn2:skchr_thorn2_3:9:stable',
    'char_1046_sbell2:skchr_sbell2_2:9:snow_dot', 'char_134_ifrit:skchr_ifrit_3:9:active',
    'char_2027_wang:skchr_wang_1:9:trap', 'char_213_mostma:skchr_mostma_2:9:active',
    'char_258_podego:skchr_podego_2:9:active', 'char_297_hamoni:skchr_hamoni_2:9:water',
    'char_4151_tinman:skchr_tinman_1:9:active', 'char_4151_tinman:skchr_tinman_2:9:active',
    'char_4202_haruka:skchr_haruka_3:9:event', 'char_469_indigo:skchr_indigo_2:9:bind',
    'char_478_kirara:skchr_kirara_2:9:periodic',
  ])
  assert.equal(checked, 847)
  assert.deepEqual([...kinds].sort(), ['COUNTER', 'NEXT_ATTACK', 'NORMAL', 'SKILL_ACTION'])
  assert.deepEqual(failures, [])
  assert.equal(JSON.stringify(getDamageCalculatorThreeStructures()), snapshot)
})

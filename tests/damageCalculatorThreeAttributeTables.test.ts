import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { getDamageCalculatorThreeStructures } from '../src/lib/damageCalculatorThree.ts'
import { getDamageThreeAttributeEntries } from '../src/lib/damageCalculatorThreeAttributeComparison.ts'
import { evaluateDamageThreeComparisonEntry, type DamageThreeComparisonOverrides } from '../src/lib/damageCalculatorThreeComparison.ts'
import { evaluateDamageThreeAttributeTables, type DamageThreeAttributeTablesInput } from '../src/lib/damageCalculatorThreeAttributeTables.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const guards = json<{ guards: { id: string; name: string; subProfessionId: string;
  skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[] }>('./fixtures/sixStarGuardSources.json').guards
const profiles = json<{ operatorId: string; operatorProfile: OperatorCombatProfile }[]>('./fixtures/sixStarGuardProfiles.json')
const sources = ['Melee', 'Ranged', 'Arts'].flatMap(group => json<ExpandedOperatorSource[]>(`../src/data/expanded${group}Sources.json`))
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
      operatorProfile: structuredClone(source.profile),
    }
  }))
const entries = getDamageThreeAttributeEntries(catalog)
function input(id: string, index: number, stageId?: string, overrides?: DamageThreeComparisonOverrides): DamageThreeAttributeTablesInput {
  const entry = entries.find(entry => entry.skill.operatorId === id && entry.skill.skillIndex === index
    && (stageId === undefined || entry.stageId === stageId))
  assert.ok(entry, `${id}/S${index}/${stageId ?? '*'}`)
  return { entry, enemyCount: 1, overrides }
}
function valid(value: DamageThreeAttributeTablesInput) {
  const output = evaluateDamageThreeAttributeTables(value)
  assert.deepEqual(output.errors, [], value.entry.key)
  assert.deepEqual(output.physical.map(row => row.value), [0, 500, 1000, 1500, 2000])
  assert.deepEqual(output.arts.map(row => row.value), [0, 20, 40, 60, 80])
  assert.ok([...output.physical, ...output.arts].every(row => row.perAttack !== null && Number.isFinite(row.perAttack)))
  return output
}
function ordinary(value: DamageThreeAttributeTablesInput, type: 'PHYSICAL' | 'ARTS', axis: number) {
  return evaluateDamageThreeComparisonEntry(value.entry, { enemyCount: value.enemyCount,
    defense: type === 'PHYSICAL' ? axis : 0, resistance: type === 'ARTS' ? axis : 0 }, value.overrides,
  { operatorLevel: value.operatorLevel, trust: value.trust, virtualMainAttackType: type })
}
function close(actual: number | null, expected: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) <= 1e-7 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
}

test('エクシアS3の主攻撃を各5条件で比較し、5連撃・攻撃間隔・最低保証を保つ', () => {
  const value = input('char_103_angel', 3)
  const before = structuredClone(value)
  const output = valid(value)
  const native = evaluateDamageThreeComparisonEntry(value.entry, { defense: 0, resistance: 0, enemyCount: 1 })
  assert.deepEqual(output.reference, native)
  assert.equal(output.canShowDps, true)
  const perHit = native.output!.rows[0].attackComponents[0].attackPipeline.finalAttack
  const interval = native.output!.attackInterval!
  for (const row of output.physical) {
    close(row.perAttack, Math.max(perHit - row.value, perHit * 0.05) * 5)
    close(row.dps, row.perAttack! / interval)
  }
  for (const row of output.arts) {
    close(row.perAttack, perHit * (1 - row.value / 100) * 5)
    close(row.dps, row.perAttack! / interval)
  }
  assert.deepEqual(value, before)
})

test('主攻撃のみを抽出し、ケオベのDEF由来術追撃とムリナール・チューバイの追加攻撃を除く', () => {
  for (const value of [input('char_2013_cerber', 2), input('char_4064_mlynar', 3), input('char_4082_qiubai', 1)]) {
    const output = valid(value)
    for (const [type, rows] of [['PHYSICAL', output.physical], ['ARTS', output.arts]] as const) {
      for (const row of rows) {
        const full = ordinary(value, type, row.value)
        const components = full.output!.rows[0].attackComponents
        const main = components.filter(component => component.role === 'MAIN').reduce((sum, component) => sum + component.expectedDamage, 0)
        const extra = components.filter(component => component.role === 'ADDITIONAL').reduce((sum, component) => sum + component.expectedDamage, 0)
        close(row.perAttack, main)
        close(full.perAttack, main + extra)
        if (extra > 0) assert.ok(row.perAttack! < full.perAttack!)
      }
    }
  }
})

test('guard・旧形式の継続ダメージを除き、通常攻撃と反撃の主攻撃を維持する', () => {
  for (const value of [input('char_355_ethan', 1), input('char_293_thorns', 3), input('char_293_thorns', 2)]) {
    const output = valid(value)
    for (const [type, rows] of [['PHYSICAL', output.physical], ['ARTS', output.arts]] as const) for (const row of rows) {
      const full = ordinary(value, type, row.value)
      if (output.canShowDps) assert.ok(full.damageOverTimeDps !== null && full.damageOverTimeDps > 0)
      else assert.equal(full.damageOverTimeDps, null, '反撃頻度が未指定のDoTの定常DPSも代用しない')
      close(row.perAttack, full.perAttack!)
      assert.equal(row.dps, full.dps)
      if (output.canShowDps) assert.ok(row.dps! < full.combinedDps!)
      else assert.equal(row.dps, null)
    }
  }
})

test('旧方式5人と単発・順序攻撃・混合・確定主攻撃も同じ集計を使う', () => {
  for (const value of [input('char_350_surtr', 3), input('char_263_skadi', 2), input('char_172_svrash', 3),
    input('char_293_thorns', 1), input('char_4009_irene', 3), input('char_210_stward', 1),
    input('char_010_chen', 2), input('char_002_amiya', 3), input('char_4088_hodrer', 3, 'dot')]) {
    const output = valid(value)
    for (const [type, rows] of [['PHYSICAL', output.physical], ['ARTS', output.arts]] as const) for (const row of rows) {
      const full = ordinary(value, type, row.value)
      assert.equal(row.perAttack, full.perAttack)
      assert.equal(row.dps, full.dps)
      if (value.entry.kind !== 'NORMAL') assert.equal(row.dps, null)
    }
  }
})

test('トギフォンスS2は遅延爆発を除き、均等な1体あたりの主攻撃を二重に対象数で割らない', () => {
  const single = valid(input('char_363_toddi', 2))
  const value = { ...input('char_363_toddi', 2), enemyCount: 3 }
  const output = valid(value)
  assert.equal(output.reference.actualTargetCount, 3)
  for (let index = 0; index < output.physical.length; index++) {
    close(output.physical[index].perAttack, single.physical[index].perAttack! / 3)
    close(output.physical[index].dps, single.physical[index].dps! / 3)
  }
  const full = ordinary(value, 'PHYSICAL', 0)
  assert.ok(full.perAttack! > output.physical[0].perAttack!)
})

test('AshS3の両方未命中は正常な0、攻撃を持たない睡眠段階は未対応として区別する', () => {
  const value = input('char_456_ash', 3, undefined, { 'guard.contactHit': false, 'guard.explosionHit': false })
  const output = valid(value)
  assert.deepEqual(output.reference.output!.rows[0].attackComponents, [])
  assert.ok([...output.physical, ...output.arts].every(row => row.perAttack === 0 && row.dps === null))
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
  for (const [type, rows] of [['PHYSICAL', output.physical], ['ARTS', output.arts]] as const) for (const row of rows) {
    const full = ordinary(value, type, row.value)
    assert.equal(row.perAttack, full.perAttack)
    assert.equal(row.dps, full.dps)
  }
  const unweakened = valid({ ...value, overrides: { 'guard.targetHpPercent': 100 } })
  assert.ok(output.arts[0].dps! > unweakened.arts[0].dps!)
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
    assert.deepEqual(output.physical.map(row => row.value), [0, 500, 1000, 1500, 2000])
    assert.deepEqual(output.arts.map(row => row.value), [0, 20, 40, 60, 80])
    assert.ok([...output.physical, ...output.arts].every(row => row.perAttack === null && row.dps === null))
  }
})

test('現在の全カタログで計算可能な仮想対応段階を欠落なく表示し、元の登録定義を変更しない', t => {
  const snapshot = JSON.stringify(getDamageCalculatorThreeStructures())
  const failures: string[] = []
  const kinds = new Set<string>()
  let checked = 0
  for (const entry of entries) {
    const reference = evaluateDamageThreeComparisonEntry(entry, { defense: 0, resistance: 0, enemyCount: 1 })
    if (!entry.capability.supported || reference.errors.length) continue
    const output = evaluateDamageThreeAttributeTables({ entry, enemyCount: 1 })
    if (output.errors.length || [...output.physical, ...output.arts].some(row => row.perAttack === null
      || !Number.isFinite(row.perAttack) || (output.canShowDps && (row.dps === null || !Number.isFinite(row.dps))))) {
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
  assert.ok(checked >= 290)
  assert.deepEqual([...kinds].sort(), ['COUNTER', 'NEXT_ATTACK', 'NORMAL', 'SKILL_ACTION'])
  assert.deepEqual(failures, [])
  assert.equal(JSON.stringify(getDamageCalculatorThreeStructures()), snapshot)
})

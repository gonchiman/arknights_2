import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySkill } from '../src/lib/classifier.ts'
import { buildDamageCalculatorThreeOutput, getDamageCalculatorThreeStructures,
  type DamageCalculatorThreeConditions } from '../src/lib/damageCalculatorThree.ts'
import { getDamageThreeComparisonEntries, evaluateDamageThreeComparisonEntry,
  type DamageThreeComparisonEntry } from '../src/lib/damageCalculatorThreeComparison.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

const guards = (JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardSources.json', import.meta.url), 'utf8')) as {
  guards: { id: string; name: string; subProfessionId: string; skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[]
}).guards
const profiles = JSON.parse(readFileSync(new URL('./fixtures/sixStarGuardProfiles.json', import.meta.url), 'utf8')) as {
  operatorId: string; operatorProfile: OperatorCombatProfile
}[]
const sources: ExpandedOperatorSource[] = ['Melee', 'Ranged', 'Arts'].flatMap(group => JSON.parse(readFileSync(
  new URL(`../src/data/expanded${group}Sources.json`, import.meta.url), 'utf8')) as ExpandedOperatorSource[])
const common = { defense: 123, resistance: 37, enemyCount: 3 }

function record(operatorId: string, skillIndex: number): SkillRecord {
  const expanded = sources.find(source => source.operatorId === operatorId)
  const guard = guards.find(source => source.id === operatorId)
  const source = (expanded?.skills ?? guard!.skills).find(skill => skill.skillIndex === skillIndex)!
  const raw = structuredClone(source.raw)
  return { id: `${operatorId}/${skillIndex}`, operatorId, operatorName: expanded?.operatorName ?? guard!.name,
    skillId: source.skillId, skillIndex, skillName: raw.name!, profession: expanded?.profession ?? 'WARRIOR',
    professionLabel: expanded?.profession ?? '前衛', rarity: expanded?.rarity ?? 6,
    subProfessionId: expanded?.subProfessionId ?? guard!.subProfessionId,
    subProfessionName: expanded?.subProfessionId ?? guard!.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: (expanded?.skillLevelIndex ?? 9) + 1 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(expanded?.profile ?? profiles.find(profile => profile.operatorId === operatorId)!.operatorProfile) }
}
const catalog = [...guards.flatMap(operator => operator.skills.map(skill => record(operator.id, skill.skillIndex))),
  ...sources.flatMap(operator => operator.skills.map(skill => record(operator.operatorId, skill.skillIndex)))]
const entries = getDamageThreeComparisonEntries(catalog)

function entry(operatorId: string, skillIndex: number, stageId?: string): DamageThreeComparisonEntry {
  const value = entries.find(item => item.skill.operatorId === operatorId && item.skill.skillIndex === skillIndex
    && (stageId === undefined || item.stageId === stageId))
  assert.ok(value, `${operatorId}/S${skillIndex}/${stageId}`)
  return value
}
function evaluate(operatorId: string, skillIndex: number, stageId?: string,
  overrides: Parameters<typeof evaluateDamageThreeComparisonEntry>[2] = {}) {
  return evaluateDamageThreeComparisonEntry(entry(operatorId, skillIndex, stageId), common, overrides)
}
function noNumbers(value: ReturnType<typeof evaluateDamageThreeComparisonEntry>) {
  for (const key of ['perAttack', 'allTargetsPerAttack', 'dps', 'allTargetsDps', 'damageOverTimeDps',
    'allTargetsDamageOverTimeDps', 'combinedDps', 'allTargetsCombinedDps', 'totalDamage', 'allTargetsTotalDamage'] as const) assert.equal(value[key], null, key)
}
function compareWithOrdinary(entry: DamageThreeComparisonEntry, conditions: DamageCalculatorThreeConditions) {
  const actual = evaluateDamageThreeComparisonEntry(entry, common)
  assert.deepEqual(actual.errors, [])
  const output = buildDamageCalculatorThreeOutput({ operator: entry.skill, skill: entry.skill,
    phaseIndex: entry.phaseIndex, operatorLevel: entry.operatorLevel, trust: 100, skillLevelIndex: entry.levelIndex,
    conditions, enemy: { defense: common.defense, resistance: common.resistance } })
  assert.deepEqual(output.unsupportedReasons, [])
  assert.equal(output.rows.length, 1)
  for (const key of ['perAttack', 'allTargetsPerAttack', 'dps', 'allTargetsDps', 'combinedDps', 'allTargetsCombinedDps'] as const) {
    assert.equal(actual[key], output.rows[0][key], `${entry.key}:${key}`)
  }
  assert.equal(actual.actualTargetCount, output.actualTargetCount)
  return actual
}

test('DC3の対応スキル全段階を一意の行として列挙し、出典にない技能は作らない', () => {
  assert.equal(catalog.length, 315)
  const expected = getDamageCalculatorThreeStructures().flatMap(structure => {
    const info = structure.basicInfo
    return (structure.guardRecipe?.stages ?? structure.effectStructure.stages)
      .map(stage => `${info.operatorId}:${info.skillId}:${info.levelIndex}:${stage.id}`)
  }).sort()
  assert.deepEqual(entries.map(entry => entry.key).sort(), expected)
  assert.equal(new Set(entries.map(entry => entry.key)).size, entries.length)
  assert.deepEqual(getDamageThreeComparisonEntries([]), [])
  const unknown = structuredClone(catalog[0])
  unknown.operatorId = 'not-implemented'
  assert.deepEqual(getDamageThreeComparisonEntries([unknown]), [])
  for (const source of sources) {
    const selected = entries.filter(entry => entry.skill.operatorId === source.operatorId)
    assert.ok(selected.length >= source.skills.length)
    for (const entry of selected) {
      assert.equal(entry.phaseIndex, source.phaseIndex)
      assert.equal(entry.operatorLevel, source.profile.phases[source.phaseIndex].maxLevel)
      assert.equal(entry.levelIndex, source.skillLevelIndex)
    }
  }
})

test('共通敵3体を上限に従って設定し、任意DEF123/RES37の通常DC3結果と一致する', () => {
  assert.equal(compareWithOrdinary(entry('char_263_skadi', 2), { actualAttackTargetCount: 1 }).actualTargetCount, 1)
  assert.equal(compareWithOrdinary(entry('char_350_surtr', 3), { actualAttackTargetCount: 3 }).actualTargetCount, 3)
  assert.equal(compareWithOrdinary(entry('char_350_surtr', 2), { actualAttackTargetCount: 2 }).actualTargetCount, 2)
  assert.equal(compareWithOrdinary(entry('char_010_chen', 2), { guard: { actualAttackTargetCount: 3 } }).damageType, 'MIXED')
  const unlimited = compareWithOrdinary(entry('char_4082_qiubai', 1), { guard: { actualAttackTargetCount: 3 } })
  assert.equal(unlimited.output!.maxTargetCount, null)
  assert.equal(unlimited.actualTargetCount, 3)
  assert.ok(unlimited.allTargetsPerAttack! > unlimited.perAttack!)
})

test('ソーンズS2を反撃型に分類し、S3は初回と2回目以降の別行で計算する', () => {
  const counter = compareWithOrdinary(entry('char_293_thorns', 2), { actualAttackTargetCount: 3 })
  assert.equal(counter.entry.kind, 'COUNTER')
  assert.equal(counter.dps, null)
  assert.equal(counter.combinedDps, null)
  const first = compareWithOrdinary(entry('char_293_thorns', 3, 'first'), { actualAttackTargetCount: 1, skillActivationCount: 1 })
  const later = compareWithOrdinary(entry('char_293_thorns', 3, 'second_and_later'), { actualAttackTargetCount: 1, skillActivationCount: 2 })
  assert.equal(first.entry.kind, 'NORMAL')
  assert.equal(later.entry.kind, 'NORMAL')
  assert.ok(later.dps! > first.dps!)
  assert.equal(first.fields.find(field => field.key === 'skillActivationCount')?.locked, true)
  assert.equal(later.fields.find(field => field.key === 'skillActivationCount')?.value, 2)
  assert.equal(later.fields.find(field => field.key === 'skillActivationCount')?.locked, false)
})

test('ブレイズS3の通常攻撃と終了爆発を別の出力型として保持し、固定段階を書き換えない', () => {
  const normal = compareWithOrdinary(entry('char_017_huang', 3, 'normal'), { guard: { phase: 'normal', actualAttackTargetCount: 3 } })
  const end = compareWithOrdinary(entry('char_017_huang', 3, 'end'), { guard: { phase: 'end', actualAttackTargetCount: 3 } })
  assert.equal(normal.entry.kind, 'NORMAL')
  assert.equal(end.entry.kind, 'SKILL_ACTION')
  assert.ok(normal.dps! > 0)
  assert.equal(end.dps, null)
  const wrongPhase = evaluate('char_017_huang', 3, 'end', { 'guard.phase': 'normal' })
  assert.deepEqual(wrongPhase.errors, [])
  assert.equal(wrongPhase.perAttack, end.perAttack)
  assert.equal(wrongPhase.fields.find(field => field.key === 'guard.phase')?.locked, true)
  assert.equal(wrongPhase.fields.find(field => field.key === 'guard.phase')?.value, 'end')
})

test('対象数と術耐性の個別上書きは共通敵条件を変更しない', () => {
  for (const [id, skillIndex] of [['char_350_surtr', 2], ['char_293_thorns', 3], ['char_010_chen', 2]] as const) {
    const clean = evaluate(id, skillIndex)
    const overridden = evaluate(id, skillIndex, undefined, {
      actualAttackTargetCount: 99, enemyResistance: NaN,
      'guard.actualAttackTargetCount': 99, 'guard.enemyResistance': NaN,
    })
    assert.deepEqual(overridden.errors, [])
    assert.equal(overridden.perAttack, clean.perAttack)
    assert.equal(overridden.allTargetsPerAttack, clean.allTargetsPerAttack)
    assert.equal(overridden.damageOverTimeDps, clean.damageOverTimeDps)
    assert.equal(overridden.actualTargetCount, clean.actualTargetCount)
    for (const field of overridden.fields.filter(field => /actualAttackTargetCount|enemyResistance/.test(field.key))) {
      assert.equal(field.locked, true)
      assert.notEqual(field.value, 99)
      assert.notEqual(field.value, NaN)
    }
  }
})

test('編集可能な条件を反映し、別段階へ移る値や不正値から比較数値を作らない', () => {
  const first = evaluate('char_4082_qiubai', 3)
  const stacked = evaluate('char_4082_qiubai', 3, undefined, { 'guard.attackStacks': 8 })
  assert.deepEqual(stacked.errors, [])
  assert.ok(stacked.dps! > first.dps!)
  assert.equal(stacked.fields.find(field => field.key === 'guard.attackStacks')?.value, 8)
  assert.equal(stacked.fields.find(field => field.key === 'guard.attackStacks')?.locked, false)
  for (const result of [
    evaluate('char_4082_qiubai', 3, undefined, { 'guard.attackStacks': NaN }),
    evaluate('char_293_thorns', 3, 'second_and_later', { skillActivationCount: 1 }),
    evaluate('char_293_thorns', 3, 'second_and_later', { skillActivationCount: NaN }),
  ]) {
    assert.ok(result.errors.length)
    noNumbers(result)
  }
  assert.match(evaluate('char_293_thorns', 3, 'second_and_later', { skillActivationCount: 1 }).errors.join(), /段階/)
})

test('保留技能・不正な共通入力は理由を残し、0やNaNのダメージとして表示しない', () => {
  const unavailable = evaluate('char_4182_oblvns', 2, 'piano')
  assert.match(unavailable.errors.join(), /音符/)
  noNumbers(unavailable)
  for (const patch of [
    { enemyCount: 0 }, { enemyCount: NaN }, { enemyCount: 1.5 }, { enemyCount: 10001 },
    { defense: NaN }, { resistance: 101 },
  ]) {
    const result = evaluateDamageThreeComparisonEntry(entry('char_350_surtr', 3), { ...common, ...patch })
    assert.ok(result.errors.length)
    noNumbers(result)
  }
})

test('継続ダメージを含む合計と直接攻撃のみの部分結果を区別し、保留分を0にしない', () => {
  const complete = evaluate('char_293_thorns', 3, 'second_and_later')
  assert.ok(complete.damageOverTimeDps! > 0)
  assert.equal(complete.combinedDps, complete.dps! + complete.damageOverTimeDps!)
  const changed = structuredClone(entry('char_293_thorns', 3, 'second_and_later'))
  for (const candidate of changed.skill.operatorProfile.talents![0].candidates!) {
    candidate.blackboard = candidate.blackboard!.filter(item => item.key !== 'damage[normal]')
  }
  const partial = evaluateDamageThreeComparisonEntry(changed, common)
  assert.deepEqual(partial.errors, [])
  assert.equal(partial.output!.hasUnsupportedTalentDamage, true)
  assert.equal(partial.perAttack, complete.perAttack)
  assert.equal(partial.dps, complete.dps)
  assert.equal(partial.damageOverTimeDps, null)
  assert.equal(partial.allTargetsDamageOverTimeDps, null)
  assert.equal(partial.combinedDps, null)
  assert.match(partial.notes.join(), /直接ダメージのみ/)
  const noPeriodic = evaluate('char_017_huang', 2)
  assert.equal(noPeriodic.damageOverTimeDps, 0)
  assert.equal(noPeriodic.combinedDps, noPeriodic.dps)
})

test('通常攻撃型の有限段階は構造化した持続時間と未丸めDPSから総ダメージを概算する', () => {
  const cases = [
    ['char_263_skadi', 2, 30, 62180],
    ['char_263_skadi', 3, 50, 89033.33333333333],
    ['char_350_surtr', 2, 18, 39121.92],
    ['char_1026_gvial2', 3, 25, 85000],
  ] as const
  for (const [id, index, duration, expected] of cases) {
    const result = evaluateDamageThreeComparisonEntry(entry(id, index), { defense: 0, resistance: 0, enemyCount: 1 })
    assert.deepEqual(result.errors, [])
    assert.equal(result.durationSeconds, duration)
    assert.ok(result.totalDamage !== null, `${id}/S${index}: ${result.totalDamageReason}`)
    assert.ok(Math.abs(result.totalDamage - expected) < 1e-8, `${id}/S${index}`)
    assert.equal(result.totalDamage, result.combinedDps! * duration)
    assert.equal(result.allTargetsTotalDamage, result.totalDamage)
    assert.equal(result.totalDamageReason, null)
  }
  // Source duration=-1 means deployment activation; its structured stage still lasts 30 seconds.
  assert.equal(entry('char_263_skadi', 2).skill.raw.duration, -1)
  const skadi = evaluateDamageThreeComparisonEntry(entry('char_263_skadi', 3), { defense: 0, resistance: 0, enemyCount: 1 })
  assert.notEqual(skadi.totalDamage, Math.round(skadi.combinedDps!) * skadi.durationSeconds!)
})

test('総ダメージは敵DEF/RESと実際の対象上限を反映し、1体と全対象の結果を保持する', () => {
  const result = evaluate('char_350_surtr', 2)
  assert.deepEqual(result.errors, [])
  assert.equal(result.actualTargetCount, 2)
  assert.equal(result.durationSeconds, 18)
  assert.equal(result.totalDamage, result.combinedDps! * 18)
  assert.equal(result.allTargetsTotalDamage, result.allTargetsCombinedDps! * 18)
  assert.equal(result.allTargetsTotalDamage, result.totalDamage! * 2)
  const unmitigated = evaluateDamageThreeComparisonEntry(entry('char_350_surtr', 2), { defense: 0, resistance: 0, enemyCount: 3 })
  assert.ok(result.totalDamage! < unmitigated.totalDamage!)
})

test('毒の定常DPSや変化途中の性能を有限総量へ変換せず、通常のDPSは保持する', () => {
  for (const [id, skillIndex, stageId, duration] of [
    ['char_293_thorns', 1, undefined, 30],
    ['char_017_huang', 3, 'normal', 10],
    ['char_4098_vvana', 2, undefined, 35],
    ['char_4082_qiubai', 3, undefined, 30],
  ] as const) {
    const result = evaluate(id, skillIndex, stageId)
    assert.deepEqual(result.errors, [])
    assert.ok(result.dps! > 0, `${id}/S${skillIndex}`)
    assert.equal(result.durationSeconds, duration)
    assert.equal(result.totalDamage, null)
    assert.equal(result.allTargetsTotalDamage, null)
    assert.ok(result.totalDamageReason, `${id}/S${skillIndex}`)
  }
  const poison = evaluate('char_293_thorns', 1)
  assert.ok(poison.damageOverTimeDps! > 0)
  assert.ok(poison.combinedDps! > poison.dps!)
  const stacks = evaluate('char_4082_qiubai', 3, undefined, { 'guard.attackStacks': 8 })
  assert.equal(stacks.totalDamage, null)
  assert.ok(stacks.dps! > evaluate('char_4082_qiubai', 3).dps!)
})

test('無期限の段階と通常攻撃型以外には期間総ダメージを作らない', () => {
  for (const [id, skillIndex, stageId] of [
    ['char_350_surtr', 3, undefined],
    ['char_017_huang', 2, undefined],
    ['char_293_thorns', 3, 'second_and_later'],
  ] as const) {
    const result = evaluate(id, skillIndex, stageId)
    assert.ok(result.dps! > 0)
    assert.equal(result.durationSeconds, null)
    assert.equal(result.totalDamage, null)
    assert.ok(result.totalDamageReason)
  }
  for (const [id, skillIndex, stageId] of [
    ['char_350_surtr', 1, undefined],
    ['char_293_thorns', 2, undefined],
    ['char_017_huang', 3, 'end'],
  ] as const) {
    const result = evaluate(id, skillIndex, stageId)
    assert.notEqual(result.entry.kind, 'NORMAL')
    assert.ok(result.perAttack! > 0)
    assert.equal(result.totalDamage, null)
    assert.equal(result.allTargetsTotalDamage, null)
  }
})

test('有限総ダメージは欠落した素質を0として補完しない', () => {
  const changed = structuredClone(entry('char_293_thorns', 1))
  for (const candidate of changed.skill.operatorProfile.talents![0].candidates!) {
    candidate.blackboard = candidate.blackboard!.filter(item => item.key !== 'damage[normal]')
  }
  const result = evaluateDamageThreeComparisonEntry(changed, common)
  assert.deepEqual(result.errors, [])
  assert.ok(result.dps! > 0)
  assert.equal(result.combinedDps, null)
  assert.equal(result.totalDamage, null)
  assert.equal(result.allTargetsTotalDamage, null)
  assert.ok(result.totalDamageReason)
})

test('攻撃しない前半を除いた段階時間を使い、SPだけの時間条件で総量を保留しない', () => {
  const mudrock = evaluate('char_311_mudrok', 3)
  assert.deepEqual(mudrock.errors, [])
  assert.equal(mudrock.entry.skill.raw.duration, 30)
  assert.equal(mudrock.durationSeconds, 20)
  assert.equal(mudrock.totalDamage, mudrock.combinedDps! * 20)
  const pinecone = evaluate('char_440_pinecn', 2)
  assert.deepEqual(pinecone.errors, [])
  assert.ok(pinecone.totalDamage! > 0)
  assert.equal(pinecone.totalDamageReason, null)
})

test('配置後の強化・一撃だけの強化・命中数による変化を固定DPSの期間合計にしない', () => {
  for (const [id, skillIndex] of [
    ['char_274_astesi', 1], ['char_155_tiger', 2], ['char_1021_kroos2', 2],
    ['char_300_phenxi', 1], ['char_341_sntlla', 1], ['char_430_fartth', 1], ['char_358_lisa', 1],
  ] as const) {
    const result = evaluate(id, skillIndex)
    assert.deepEqual(result.errors, [], `${id}/S${skillIndex}`)
    assert.ok(result.dps! > 0)
    assert.equal(result.totalDamage, null, `${id}/S${skillIndex}`)
    assert.equal(result.allTargetsTotalDamage, null)
    assert.ok(result.totalDamageReason)
  }
  const ammunition = evaluate('char_456_ash', 2)
  assert.ok(ammunition.dps! > 0)
  assert.equal(ammunition.durationSeconds, null)
  assert.equal(ammunition.totalDamage, null)
  assert.match(ammunition.totalDamageReason!, /弾薬/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { classifySkill } from '../src/lib/classifier.ts'
import { getDamageCalculatorThreeStructures, getDamageCalculatorThreeVirtualAttackCapability } from '../src/lib/damageCalculatorThree.ts'
import {
  evaluateDamageThreeComparisonEntry, getDamageThreeComparisonEntries,
  type DamageThreeComparisonCommon, type DamageThreeComparisonEntry,
} from '../src/lib/damageCalculatorThreeComparison.ts'
import {
  evaluateDamageThreeAttributeComparison, getDamageThreeAttributeEntries,
} from '../src/lib/damageCalculatorThreeAttributeComparison.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { OperatorCombatProfile, RawSkillLevel, SkillRecord } from '../src/types/skill.ts'

// Use the same reviewed source fixtures as ordinary DC3 comparison, including legacy evaluators.
const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const guards = json<{ guards: { id: string; name: string; subProfessionId: string;
  skills: { skillId: string; skillIndex: number; raw: RawSkillLevel }[] }[] }>('./fixtures/sixStarGuardSources.json').guards
const profiles = json<{ operatorId: string; operatorProfile: OperatorCombatProfile }[]>('./fixtures/sixStarGuardProfiles.json')
const sources = ['Melee', 'Ranged', 'Arts', 'Caster', 'Support', 'Special', 'Elemental', 'Summon'].flatMap(group =>
  json<ExpandedOperatorSource[]>(`../src/data/expanded${group}Sources.json`))

function record(operatorId: string, skillIndex: number): SkillRecord {
  const expanded = sources.find(source => source.operatorId === operatorId)
  const guard = guards.find(source => source.id === operatorId)
  const source = (expanded?.skills ?? guard!.skills).find(skill => skill.skillIndex === skillIndex)!
  const raw = structuredClone(source.raw)
  return {
    id: `${operatorId}/${skillIndex}`, operatorId, operatorName: expanded?.operatorName ?? guard!.name,
    overrideTokenKey: expanded?.profile.summonSkillTokenKeys?.[skillIndex - 1] ?? undefined,
    skillId: source.skillId, skillIndex, skillName: raw.name!, profession: expanded?.profession ?? 'WARRIOR',
    professionLabel: expanded?.profession ?? '前衛', rarity: expanded?.rarity ?? 6,
    subProfessionId: expanded?.subProfessionId ?? guard!.subProfessionId,
    subProfessionName: expanded?.subProfessionId ?? guard!.subProfessionId, nameInitial: 'OTHER',
    description: raw.description!, duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!,
    spType: raw.spData!.spType!, spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    skillLevels: Array.from({ length: (expanded?.skillLevelIndex ?? 9) + 1 }, () => structuredClone(raw)), raw,
    operatorProfile: structuredClone(expanded?.profile ?? profiles.find(profile => profile.operatorId === operatorId)!.operatorProfile),
  }
}

const catalog = [...guards.flatMap(operator => operator.skills.map(skill => record(operator.id, skill.skillIndex))),
  ...sources.flatMap(operator => operator.skills.map(skill => record(operator.operatorId, skill.skillIndex)))]
const ordinaryEntries = getDamageThreeComparisonEntries(catalog)
const attributeEntries = getDamageThreeAttributeEntries(catalog)
const enemyConditions: readonly DamageThreeComparisonCommon[] = [
  { defense: 0, resistance: 0, enemyCount: 1 },
  { defense: 713, resistance: 37, enemyCount: 3 },
  { defense: 10000, resistance: 100, enemyCount: 5 },
]
const targetTypes = ['PHYSICAL', 'ARTS'] as const

function findEntry(operatorId: string, skillIndex: number, stageId?: string): DamageThreeComparisonEntry {
  const found = ordinaryEntries.find(entry => entry.skill.operatorId === operatorId
    && entry.skill.skillIndex === skillIndex && (stageId === undefined || entry.stageId === stageId))
  assert.ok(found, `${operatorId}/S${skillIndex}/${stageId ?? '*'}`)
  return found
}

test('属性比較は通常DC3の全カタログ段階を欠落・重複なく列挙する', () => {
  assert.ok(catalog.length >= 373)
  assert.deepEqual(attributeEntries.map(entry => entry.key).sort(), ordinaryEntries.map(entry => entry.key).sort())
  assert.equal(new Set(attributeEntries.map(entry => entry.key)).size, attributeEntries.length)
  assert.deepEqual(getDamageThreeAttributeEntries([]), [])
})

test('攻撃を持つ計算可能な全段階を複数の敵条件で物理・術へ変更でき、同属性では全結果を保持する', () => {
  const failures: string[] = []
  const successfulStages = new Set<string>()
  const kinds = new Set<string>()
  const nativeDamageTypes = new Set<string>()
  let sameTypeChecks = 0
  let legacyChecks = 0
  let guardChecks = 0
  const structuresBefore = JSON.stringify(getDamageCalculatorThreeStructures())
  for (const entry of ordinaryEntries) {
    for (const common of enemyConditions) {
      const original = evaluateDamageThreeComparisonEntry(entry, common)
      if (original.errors.length || original.output?.rows.length !== 1) continue
      const identity = `${entry.key} DEF=${common.defense} RES=${common.resistance} N=${common.enemyCount}`
      assert.ok(original.perAttack !== null && Number.isFinite(original.perAttack), identity)
      const stage = entry.structure.guardRecipe?.stages.find(stage => stage.id === entry.stageId)
      if (stage?.actions.length === 0) {
        assert.equal(original.perAttack, 0, identity)
        assert.deepEqual(original.output.rows[0].attackComponents, [], identity)
        continue
      }
      if (stage && !stage.actions.some(action => action.role === 'MAIN')) {
        assert.ok(stage.actions.every(action => action.role === 'ADDITIONAL'), identity)
        for (const targetType of targetTypes) {
          const changed = evaluateDamageThreeComparisonEntry(entry, common, {}, { virtualMainAttackType: targetType })
          assert.match(changed.errors.join(), /主攻撃がありません/, identity)
          assert.deepEqual(changed.output?.rows, [], identity)
          assert.equal(changed.perAttack, null, identity)
        }
        continue
      }
      successfulStages.add(entry.key)
      kinds.add(entry.kind)
      nativeDamageTypes.add(original.damageType ?? 'UNKNOWN')
      if (entry.structure.guardRecipe) guardChecks++
      else legacyChecks++
      for (const targetType of targetTypes) {
        const changed = evaluateDamageThreeComparisonEntry(entry, common, {}, { virtualMainAttackType: targetType })
        if (changed.errors.length || changed.output?.rows.length !== 1 || changed.perAttack === null
          || !Number.isFinite(changed.perAttack)) {
          failures.push(`${identity} → ${targetType}: ${changed.errors.join(' / ') || '有効な計算結果がありません'}`)
          continue
        }
        if (changed.actualTargetCount !== original.actualTargetCount) failures.push(`${identity}: 属性変更で対象数が変化しました`)
        // A homogeneous physical/arts result is the unchanged case; mixed/true originals are tested separately below.
        if (original.damageType === targetType) {
          sameTypeChecks++
          if (!isDeepStrictEqual(changed, original)) failures.push(`${identity}: 同属性 ${targetType} で結果が変化しました`)
        }
      }
    }
  }
  assert.ok(successfulStages.size >= 290, `通常計算に成功した段階が想定より少ない: ${successfulStages.size}`)
  assert.ok(legacyChecks > 0 && guardChecks > 0, '旧方式・レシピ方式の両方を検査する')
  assert.ok(sameTypeChecks > 250)
  assert.deepEqual([...kinds].sort(), ['COUNTER', 'NEXT_ATTACK', 'NORMAL', 'SKILL_ACTION'])
  assert.ok(nativeDamageTypes.has('TRUE') && nativeDamageTypes.has('MIXED'))
  assert.equal(JSON.stringify(getDamageCalculatorThreeStructures()), structuresBefore, '元の登録済み定義を変更しない')
  assert.deepEqual(failures, [], failures.join('\n'))
})

test('通常・強化攻撃・反撃・発動動作・確定・複合属性を属性比較アダプターから計算する', () => {
  const examples = [
    { id: 'char_350_surtr', skill: 3, kind: 'NORMAL', damageType: 'ARTS' },
    { id: 'char_103_angel', skill: 1, kind: 'NEXT_ATTACK', damageType: 'PHYSICAL' },
    { id: 'char_293_thorns', skill: 2, kind: 'COUNTER', damageType: 'PHYSICAL' },
    { id: 'char_017_huang', skill: 3, stage: 'end', kind: 'SKILL_ACTION', damageType: 'PHYSICAL' },
    { id: 'char_002_amiya', skill: 3, kind: 'NORMAL', damageType: 'TRUE' },
    { id: 'char_010_chen', skill: 2, kind: 'SKILL_ACTION', damageType: 'MIXED' },
    { id: 'char_4088_hodrer', skill: 3, stage: 'dot', kind: 'SKILL_ACTION', damageType: 'TRUE' },
  ] as const
  const common = enemyConditions[1]
  for (const example of examples) {
    const ordinary = findEntry(example.id, example.skill, 'stage' in example ? example.stage : undefined)
    const entry = attributeEntries.find(entry => entry.key === ordinary.key)
    assert.ok(entry, `${ordinary.key}: 属性比較に列挙されている`)
    const native = evaluateDamageThreeComparisonEntry(entry, common)
    assert.deepEqual(native.errors, [], ordinary.key)
    assert.equal(native.entry.kind, example.kind)
    assert.equal(native.damageType, example.damageType)
    for (const targetType of targetTypes) {
      const comparison = evaluateDamageThreeAttributeComparison({ entry, common, targetType, axis: 'resistance' })
      assert.deepEqual(comparison.errors, [], `${ordinary.key} → ${targetType}`)
      assert.deepEqual(comparison.original, native)
      assert.ok(comparison.changed?.perAttack !== null && Number.isFinite(comparison.changed?.perAttack))
      const selected = comparison.samples.find(point => point.x === common.resistance)
      assert.ok(selected)
      assert.equal(selected.original.perAttack, native.perAttack)
      assert.equal(selected.changed.perAttack, comparison.changed?.perAttack)
      if (example.kind !== 'NORMAL') {
        assert.equal(comparison.changed?.dps, null, '攻撃頻度を持たない出力にDPSを作らない')
        assert.equal(comparison.changed?.combinedDps, null)
      }
    }
  }
})

test('全guardRecipeの攻撃は役割が明示され、主攻撃がない段階は属性変更の理由を残す', () => {
  for (const structure of getDamageCalculatorThreeStructures()) {
    for (const stage of structure.guardRecipe?.stages ?? []) {
      const identity = `${structure.basicInfo.operatorId}/S${structure.basicInfo.skillIndex}/${stage.id}`
      for (const action of stage.actions) assert.ok(action.role === 'MAIN' || action.role === 'ADDITIONAL', `${identity}/${action.label}`)
      if (!stage.actions.some(action => action.role === 'MAIN')) {
        assert.ok(stage.actions.every(action => action.role === 'ADDITIONAL'), identity)
        const capability = getDamageCalculatorThreeVirtualAttackCapability(structure, stage.id)
        assert.equal(capability.supported, false, identity)
        assert.ok(capability.reason, identity)
      }
    }
  }
})

test('グレインバッズS2の攻撃停止中はダメージ0を保ち、存在しない主攻撃の属性は変更しない', () => {
  const entry = attributeEntries.find(entry => entry.key === findEntry('char_4122_grabds', 2, 'sleep').key)!
  for (const targetType of targetTypes) {
    const result = evaluateDamageThreeAttributeComparison({ entry, common: enemyConditions[1], targetType, axis: 'resistance' })
    assert.deepEqual(result.original.errors, [])
    assert.equal(result.original.perAttack, 0)
    assert.equal(result.changed, null)
    assert.match(result.errors.join(), /主攻撃がありません/)
    assert.deepEqual(result.samples, [])
    const direct = evaluateDamageThreeComparisonEntry(entry, enemyConditions[1], {}, { virtualMainAttackType: targetType })
    assert.match(direct.errors.join(), /主攻撃がありません/)
    assert.deepEqual(direct.output?.rows, [])
  }
})

test('強化攻撃型でも独立追加ダメージと継続ダメージを属性変更しない', () => {
  for (const [operatorId, skillIndex, targetType] of [
    ['char_4082_qiubai', 1, 'ARTS'],
    ['char_1019_siege2', 1, 'PHYSICAL'],
    ['char_134_ifrit', 2, 'PHYSICAL'],
  ] as const) {
    const entry = findEntry(operatorId, skillIndex)
    const common = enemyConditions[1]
    const original = evaluateDamageThreeComparisonEntry(entry, common)
    const changed = evaluateDamageThreeComparisonEntry(entry, common, {}, { virtualMainAttackType: targetType })
    assert.deepEqual(original.errors, [], entry.key)
    assert.deepEqual(changed.errors, [], entry.key)
    assert.equal(entry.kind, 'NEXT_ATTACK')
    const extraBefore = original.output!.rows[0].attackComponents.filter(component => component.role === 'ADDITIONAL')
    const extraAfter = changed.output!.rows[0].attackComponents.filter(component => component.role === 'ADDITIONAL')
    assert.ok(extraBefore.length > 0 || original.damageOverTimeDps !== null, entry.key)
    assert.deepEqual(extraAfter, extraBefore, `${entry.key}: 独立追加攻撃を保持する`)
    assert.equal(changed.damageOverTimeDps, original.damageOverTimeDps, `${entry.key}: 継続ダメージを保持する`)
    assert.equal(changed.dps, null)
  }
})

test('HP・防御低下重複数・戦慄条件を満たす条件付き対応も両属性で計算する', () => {
  const scenarios = [
    ...[1, 2, 3].flatMap(skillIndex => [20, 100].map(hp => ({
      entry: findEntry('char_4037_demetr', skillIndex),
      overrides: { 'guard.targetHpPercent': hp, 'guard.defenseDebuffStacks': skillIndex === 2 ? 8 : 5 },
    }))),
    ...[2, 3].map(skillIndex => ({ entry: findEntry('char_4116_blkkgt', skillIndex),
      overrides: { 'guard.targetTrembling': true },
    })),
  ]
  for (const { entry, overrides } of scenarios) {
    for (const common of enemyConditions) {
      const original = evaluateDamageThreeComparisonEntry(entry, common, overrides)
      assert.deepEqual(original.errors, [], entry.key)
      for (const targetType of targetTypes) {
        const changed = evaluateDamageThreeComparisonEntry(entry, common, overrides, { virtualMainAttackType: targetType })
        assert.deepEqual(changed.errors, [], `${entry.key} → ${targetType}`)
        assert.ok(changed.perAttack !== null && Number.isFinite(changed.perAttack))
        assert.equal(changed.actualTargetCount, original.actualTargetCount)
        if (original.damageType === targetType) assert.deepEqual(changed, original)
      }
    }
  }
})

test('通常DC3で未対応の段階や不正な出典は属性変更で救済せず数値を出さない', () => {
  const pending = findEntry('char_4182_oblvns', 2, 'piano')
  const unsupportedWave = findEntry('char_1050_chen3', 3, 'wave')
  const corrupt = structuredClone(findEntry('char_103_angel', 3))
  corrupt.skill.skillLevels[corrupt.levelIndex].blackboard = []
  for (const entry of [pending, unsupportedWave, corrupt]) {
    const original = evaluateDamageThreeComparisonEntry(entry, enemyConditions[1])
    assert.ok(original.errors.length, entry.key)
    for (const targetType of targetTypes) {
      const changed = evaluateDamageThreeComparisonEntry(entry, enemyConditions[1], {}, { virtualMainAttackType: targetType })
      assert.ok(changed.errors.length, `${entry.key} → ${targetType}`)
      assert.equal(changed.perAttack, null)
      assert.equal(changed.dps, null)
      assert.equal(changed.combinedDps, null)
      assert.deepEqual(changed.output?.rows, [])
    }
  }
})

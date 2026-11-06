import test from 'node:test'
import assert from 'node:assert/strict'
import rawSources from '../src/data/expandedRangedSources.json' with { type: 'json' }
import { EXPANDED_RANGED_DEFINITIONS } from '../src/lib/expandedRangedDefinitions.ts'
import { getDamageCalculatorThreeStructures } from '../src/lib/damageCalculatorThree.ts'
import { buildGuardDamageOutput } from '../src/lib/guardDamageCalculator.ts'
import { classifySkill } from '../src/lib/classifier.ts'
import type { ExpandedOperatorSource } from '../src/lib/expandedCombatTypes.ts'
import type { GuardDamageAction, GuardStage } from '../src/lib/guardCombatTypes.ts'
import type { SkillRecord } from '../src/types/skill.ts'

// A test-only attribute restriction exposes the distinct native/virtual passive
// evaluations. The actual Ju talent caps all of his damage, regardless of type.
function withPhysicalCap(run: (calculate: (extra?: GuardDamageAction, virtual?: 'ARTS') => ReturnType<typeof buildGuardDamageOutput>) => void) {
  const source = (rawSources as unknown as ExpandedOperatorSource[]).find(entry => entry.operatorId === 'char_4221_ju')!
  const entry = source.skills.find(skill => skill.skillIndex === 2)!, raw = structuredClone(entry.raw)
  const skill: SkillRecord = {
    id: `${source.operatorId}/2`, operatorId: source.operatorId, operatorName: source.operatorName,
    profession: source.profession, professionLabel: '狙撃', rarity: source.rarity,
    subProfessionId: source.subProfessionId, subProfessionName: source.subProfessionId, nameInitial: 'OTHER',
    skillId: entry.skillId, skillIndex: 2, skillName: raw.name!, raw, description: raw.description!,
    duration: raw.duration!, durationType: raw.durationType!, skillType: raw.skillType!, spType: raw.spData!.spType!,
    spCost: raw.spData!.spCost!, initSp: raw.spData!.initSp!, classification: classifySkill(raw),
    operatorProfile: structuredClone(source.profile), skillLevels: Array.from({ length: 10 }, () => structuredClone(raw)),
  }
  const talent = EXPANDED_RANGED_DEFINITIONS.find(entry => entry.operatorId === source.operatorId)!.talents[0]
  const originalEffects = talent.effects
  try {
    talent.effects = binding => originalEffects(binding).map(effect => effect.item === 'DAMAGE_CAP_PER_TARGET'
      ? { ...effect, condition: { type: 'COMPARE', metric: 'attack.damageType', comparison: 'EQ', value: 'PHYSICAL' } }
      : effect)
    const original = getDamageCalculatorThreeStructures().find(structure => structure.basicInfo.operatorId === source.operatorId
      && structure.basicInfo.skillIndex === 2)!
    run((extra, virtualMainAttackType) => {
      const stage: GuardStage = { id: 'normal', label: 'test', kind: 'NORMAL',
        actions: [{ label: 'main', role: 'MAIN', damageType: 'PHYSICAL', scale: 1 }, ...(extra ? [extra] : [])] }
      const structure = { ...original, guardRecipe: { ...original.guardRecipe!, stages: [stage] } }
      return buildGuardDamageOutput({ operator: skill, skill, phaseIndex: source.phaseIndex,
        operatorLevel: source.profile.phases[source.phaseIndex].maxLevel!, trust: 100, skillLevelIndex: source.skillLevelIndex,
        conditions: { guard: { targetCurrentHp: 100 } }, enemy: { defense: 0, resistance: 0 }, virtualMainAttackType }, structure)
    })
  } finally {
    talent.effects = originalEffects
  }
}

test('仮想主攻撃で上限が不成立でも、物理追加攻撃に上限が残る複数命中を拒否する', () => {
  withPhysicalCap(calculate => {
    for (const basis of [undefined, 'ATK_STAT'] as const) for (const virtual of [undefined, 'ARTS'] as const) {
      const result = calculate({ label: 'additional', role: 'ADDITIONAL', damageType: 'PHYSICAL', scale: 1, basis }, virtual)
      assert.deepEqual(result.rows, [])
      assert.ok(result.unsupportedReasons.some(reason => reason.includes('ダメージ上限')), `${basis} / ${virtual}`)
      assert.equal(result.canShowDps, false)
      assert.equal(result.attackInterval, null)
    }
  })
})

test('追加攻撃がなく仮想術で上限が不成立なら、元の物理上限を誤って残さない', () => {
  withPhysicalCap(calculate => {
    const native = calculate()
    assert.deepEqual(native.unsupportedReasons, [])
    assert.equal(native.rows[0].perAttack, 99)
    assert.equal(native.rows[0].dps, null)
    const virtual = calculate(undefined, 'ARTS')
    assert.deepEqual(virtual.unsupportedReasons, [])
    assert.equal(virtual.rows[0].perAttack, virtual.stats.attack)
    assert.ok(virtual.rows[0].dps !== null && virtual.rows[0].dps > 0)
  })
})

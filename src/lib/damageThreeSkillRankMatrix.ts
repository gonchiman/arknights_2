import type { DamageThreeAttributeEntry } from './damageCalculatorThreeAttributeComparison.ts'
import { evaluateDamageThreeAttributeRankTable } from './damageCalculatorThreeAttributeTables.ts'
import { evaluateDamageThreeComparisonEntry } from './damageCalculatorThreeComparison.ts'
import type { EnemyResistanceThreshold } from './enemyDefenseResistance.ts'

export type DamageThreeSkillRankMode = 'virtual' | 'actual'
export type SkillRankEffectPolicy = 'apply' | 'excludePenetration' | 'excludeAttributeEffects'
type RankPair = Pick<EnemyResistanceThreshold, 'resistance' | 'defense' | 'percentage'>
export interface DamageCell {
  physical: number | null
  arts: number | null
}

export function getDamageDifference({ physical, arts }: DamageCell): number | null {
  if (physical === null || arts === null) return null
  const difference = physical - arts
  return Number.isFinite(difference) ? difference : null
}

/** Evaluate only the skill stages currently visible, at one attack/action against one target. */
export function evaluateDamageThreeSkillRankRow(
  entry: DamageThreeAttributeEntry, pairs: readonly RankPair[], mode: DamageThreeSkillRankMode,
  effectPolicy: SkillRankEffectPolicy | boolean = 'apply',
): { cells: DamageCell[]; errors: string[]; isExpectedValue: boolean; hasUnsupportedTalentDamage: boolean } {
  // Boolean inputs reproduce the v1 penetration-only comparison.
  const disablePenetration = effectPolicy === true || effectPolicy === 'excludePenetration'
  if (mode === 'virtual') {
    const { rows, errors, hasProbabilisticMainAttack } = evaluateDamageThreeAttributeRankTable(
      { entry, enemyCount: 1, disablePenetration, excludeAttributeEffects: effectPolicy === 'excludeAttributeEffects' }, pairs,
    )
    return {
      cells: rows.map(({ physical, arts }) => ({ physical, arts })),
      errors,
      isExpectedValue: hasProbabilisticMainAttack,
      hasUnsupportedTalentDamage: false,
    }
  }

  const errors = new Set<string>()
  let hasUnsupportedTalentDamage = false
  let isExpectedValue = false
  const cells = pairs.map(({ defense, resistance }): DamageCell => {
    const missing = { physical: null, arts: null }
    if (defense === null) return missing
    const result = evaluateDamageThreeComparisonEntry(entry, { defense, resistance, enemyCount: 1 }, {}, { disablePenetration })
    if (result.errors.length) {
      for (const error of result.errors) errors.add(error)
      return missing
    }
    const row = result.output?.rows[0]
    if (!row || result.perAttack === null) {
      errors.add('直接ダメージの計算結果を取得できません。')
      return missing
    }
    // Components contain the resolved attribute of each probabilistic branch, with hit counts
    // and probabilities already applied. Periodic damage is tracked separately by DC3.
    if (!row.breakdown && !row.attackComponents.length) {
      const stage = entry.structure.guardRecipe?.stages.find(stage => stage.id === entry.stageId)
      if (stage?.actions.every(action => action.timing === 'PER_SECOND' || action.timing === 'ON_DEPLOY')) {
        errors.add('この段階では1回の直接ダメージを表示できません。')
        return missing
      }
    }
    hasUnsupportedTalentDamage ||= !!result.output?.hasUnsupportedTalentDamage
    isExpectedValue ||= !!result.output?.hasProbabilisticDamage
    if (row.breakdown) {
      const type = row.breakdown.mitigation.damageType
      return { physical: type === 'PHYSICAL' ? row.perAttack : 0, arts: type === 'ARTS' ? row.perAttack : 0 }
    }
    let physical = 0
    let arts = 0
    for (const component of row.attackComponents) {
      if (component.damageType === 'PHYSICAL') physical += component.expectedDamage
      if (component.damageType === 'ARTS') arts += component.expectedDamage
    }
    return { physical, arts }
  })
  return { cells, errors: [...errors], isExpectedValue, hasUnsupportedTalentDamage }
}

import { calculateDamageBreakdown, type DamageCalculationBreakdown, type DamageType } from './damageCalculator.ts'

export interface ProbabilisticDamageBranch {
  id: 'NORMAL' | 'IGNORE'
  probability: number
  defenseIgnoreRatio: number
  damage: number
  mitigation: DamageCalculationBreakdown
}

/** Weight actual damage outcomes, including each outcome's minimum-damage rule. */
export function calculateProbabilisticDefenseIgnoreDamage(input: {
  attack: number; damageType: DamageType; enemyDefense: number; enemyResistance: number
  chance: number; ratio: number; count: number; resistanceIgnoreFixed?: number
}): { expectedDamage: number; branches: ProbabilisticDamageBranch[] } {
  if (![input.attack, input.enemyDefense, input.enemyResistance, input.chance, input.ratio].every(Number.isFinite)
    || input.attack < 0 || input.enemyDefense < 0 || input.enemyResistance < 0 || input.enemyResistance > 100
    || input.chance < 0 || input.chance > 1 || input.ratio < 0 || input.ratio > 1
    || !Number.isSafeInteger(input.count) || input.count < 1
    || (input.resistanceIgnoreFixed !== undefined && (!Number.isFinite(input.resistanceIgnoreFixed) || input.resistanceIgnoreFixed < 0))) {
    throw new RangeError('防御無視の確率・割合・ダメージ計算値を取得できません。')
  }
  const branches = [
    { id: 'NORMAL' as const, probability: 1 - input.chance, defenseIgnoreRatio: 0 },
    { id: 'IGNORE' as const, probability: input.chance, defenseIgnoreRatio: input.ratio },
  ].map(branch => {
    // Materialize this branch's ignored defense, keeping the original axis in the breakdown.
    const mitigation = calculateDamageBreakdown(input.attack, input.damageType, input.enemyDefense, input.enemyResistance,
      { defenseIgnoreFixed: input.enemyDefense * branch.defenseIgnoreRatio, resistanceIgnoreFixed: input.resistanceIgnoreFixed })
    return { ...branch, damage: mitigation.result * input.count, mitigation }
  })
  const expectedDamage = branches.reduce((sum, branch) => sum + branch.probability * branch.damage, 0)
  if (!Number.isFinite(expectedDamage)) throw new RangeError('防御無視を含むダメージ期待値を計算できません。')
  return { expectedDamage, branches }
}

import type {
  DamageCalculationBreakdown,
  DamageType,
  SkillDamageBreakdown,
} from './damageCalculator'

export type DamageSensitivityMetric = 'DAMAGE' | 'DPS' | 'TOTAL'

export function selectDamageSensitivityType(
  normalDamageType: DamageType | null,
  skillDamageType: DamageType | null,
  metric: DamageSensitivityMetric,
  skillSeriesAvailable: boolean,
): DamageType | null {
  if (metric === 'TOTAL') return skillDamageType
  if (skillSeriesAvailable && skillDamageType && skillDamageType !== 'TRUE') return skillDamageType
  if (normalDamageType && normalDamageType !== 'TRUE') return normalDamageType
  return skillSeriesAvailable ? skillDamageType ?? normalDamageType : normalDamageType
}

export function selectDamageSensitivityValues({
  metric,
  normalBreakdown,
  normalAttackInterval,
  skillBreakdown,
  canShowSkillTotal,
}: {
  metric: DamageSensitivityMetric
  normalBreakdown: DamageCalculationBreakdown | null
  normalAttackInterval: number
  skillBreakdown: SkillDamageBreakdown | null
  canShowSkillTotal: boolean
}): { normal: number | null; skill: number | null } {
  const normal = metric === 'TOTAL' || normalBreakdown === null
    ? null
    : metric === 'DPS'
      ? normalAttackInterval > 0 ? normalBreakdown.result / normalAttackInterval : null
      : normalBreakdown.result
  const skill = metric === 'DPS'
    ? skillBreakdown?.dps ?? null
    : metric === 'TOTAL'
      ? canShowSkillTotal ? skillBreakdown?.total ?? null : null
      : skillBreakdown?.perAttack ?? null

  return { normal, skill }
}

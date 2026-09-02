import type {
  DamageCalculationBreakdown,
  DamageType,
  SkillDamageBreakdown,
} from './damageCalculator'

export type DamageSensitivityMetric = 'DAMAGE' | 'DPS' | 'TOTAL'

const PHYSICAL_TABLE_POINTS = [0, 500, 1000, 1500, 2000]
const ARTS_TABLE_POINTS = [0, 20, 40, 60, 80, 95, 100]

export function getDamageSensitivityTablePoints(
  damageType: DamageType | null,
  physicalMinimumBreakpoints: number[] = [],
): number[] {
  if (damageType === 'ARTS') return [...ARTS_TABLE_POINTS]
  if (damageType !== 'PHYSICAL') return [0]

  const furthestBreakpoint = Math.max(0, ...physicalMinimumBreakpoints.filter(Number.isFinite))
  const dynamicMaximum = Math.max(2000, Math.ceil((furthestBreakpoint + 500) / 500) * 500)
  return [...new Set([...PHYSICAL_TABLE_POINTS, dynamicMaximum])].sort((a, b) => a - b)
}

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

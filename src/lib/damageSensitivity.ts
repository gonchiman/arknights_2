import type {
  DamageCalculationBreakdown,
  DamageType,
  SkillDamageBreakdown,
} from './damageCalculator'

export type DamageSensitivityMetric = 'DAMAGE' | 'DPS' | 'TOTAL'
export type DamageSensitivityTarget = 'NORMAL' | 'SKILL'

export interface DamageSensitivityBreakdown {
  damageType: DamageType
  beforeMitigation: number
  afterMitigation: number
  minimumDamage: number | null
  minimumApplied: boolean
  minimumReached: boolean
  finalValue: number
  inputMitigationStat: number | null
  fixedIgnore: number
  appliedMitigationStat: number | null
}

export const DEFAULT_DAMAGE_SENSITIVITY_TARGET: DamageSensitivityTarget = 'SKILL'

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
  target: DamageSensitivityTarget,
  normalDamageType: DamageType | null,
  skillDamageType: DamageType | null,
): DamageType | null {
  return target === 'NORMAL' ? normalDamageType : skillDamageType
}

export function getDamageSensitivityMetricForTarget(
  target: DamageSensitivityTarget,
  metric: DamageSensitivityMetric,
): DamageSensitivityMetric {
  return isDamageSensitivityMetricAvailable(target, metric) ? metric : 'DAMAGE'
}

export function isDamageSensitivityMetricAvailable(
  target: DamageSensitivityTarget,
  metric: DamageSensitivityMetric,
): boolean {
  return target === 'SKILL' || metric !== 'TOTAL'
}

export function getDamageSensitivityTableHeaders({
  axisLabel,
  target,
  metric,
  skillTotalLabel,
  normalPrefix = '',
}: {
  axisLabel: string
  target: DamageSensitivityTarget
  metric: DamageSensitivityMetric
  skillTotalLabel: string
  normalPrefix?: string
}): [string, string] {
  const effectiveMetric = getDamageSensitivityMetricForTarget(target, metric)
  const valueLabel = effectiveMetric === 'TOTAL'
    ? `スキル ${skillTotalLabel}`
    : effectiveMetric === 'DPS'
      ? target === 'NORMAL' ? '通常攻撃 DPS' : 'スキル DPS'
      : target === 'NORMAL' ? '通常攻撃 1ヒット' : 'スキル 1攻撃'
  return [axisLabel, `${target === 'NORMAL' ? normalPrefix : ''}${valueLabel}`]
}

export function selectDamageSensitivityValue({
  target,
  metric,
  normalBreakdown,
  normalAttackInterval,
  skillBreakdown,
  canShowSkillTotal,
}: {
  target: DamageSensitivityTarget
  metric: DamageSensitivityMetric
  normalBreakdown: DamageCalculationBreakdown | null
  normalAttackInterval: number
  skillBreakdown: SkillDamageBreakdown | null
  canShowSkillTotal: boolean
}): number | null {
  const effectiveMetric = getDamageSensitivityMetricForTarget(target, metric)
  if (target === 'NORMAL') {
    if (normalBreakdown === null) return null
    return effectiveMetric === 'DPS'
      ? normalAttackInterval > 0 ? normalBreakdown.result / normalAttackInterval : null
      : normalBreakdown.result
  }

  return effectiveMetric === 'DPS'
    ? skillBreakdown?.dps ?? null
    : effectiveMetric === 'TOTAL'
      ? canShowSkillTotal ? skillBreakdown?.total ?? null : null
      : skillBreakdown?.perAttack ?? null
}

export function getDamageSensitivityBreakdown({
  target,
  metric,
  normalBreakdown,
  normalAttackInterval,
  skillBreakdown,
  canShowSkillTotal,
}: {
  target: DamageSensitivityTarget
  metric: DamageSensitivityMetric
  normalBreakdown: DamageCalculationBreakdown | null
  normalAttackInterval: number
  skillBreakdown: SkillDamageBreakdown | null
  canShowSkillTotal: boolean
}): DamageSensitivityBreakdown | null {
  const mitigation = target === 'NORMAL' ? normalBreakdown : skillBreakdown?.mitigation ?? null
  const finalValue = selectDamageSensitivityValue({
    target,
    metric,
    normalBreakdown,
    normalAttackInterval,
    skillBreakdown,
    canShowSkillTotal,
  })
  const metricScale = getDamageSensitivityMetricScale({
    target,
    metric,
    normalAttackInterval,
    skillBreakdown,
    canShowSkillTotal,
  })
  if (mitigation === null || finalValue === null || metricScale === null) return null

  const afterMitigationPerHit = mitigation.damageType === 'PHYSICAL'
    ? mitigation.afterDefense ?? mitigation.attack
    : mitigation.damageType === 'ARTS'
      ? mitigation.afterResistance ?? mitigation.attack
      : mitigation.attack
  const beforeMitigation = mitigation.attack * metricScale
  const afterMitigation = Math.max(0, afterMitigationPerHit) * metricScale
  const minimumDamage = mitigation.minimumDamage === null
    ? null
    : mitigation.minimumDamage * metricScale
  const minimumTolerance = minimumDamage === null
    ? 0
    : Number.EPSILON * Math.max(1, Math.abs(beforeMitigation), Math.abs(minimumDamage), Math.abs(finalValue)) * 32

  return {
    damageType: mitigation.damageType,
    beforeMitigation,
    afterMitigation,
    minimumDamage,
    minimumApplied: mitigation.minimumApplied,
    minimumReached: minimumDamage !== null
      && minimumDamage > 0
      && finalValue <= minimumDamage + minimumTolerance,
    finalValue,
    inputMitigationStat: mitigation.damageType === 'PHYSICAL'
      ? mitigation.defenseBeforeIgnore
      : mitigation.damageType === 'ARTS'
        ? mitigation.resistanceBeforeIgnore
        : null,
    fixedIgnore: mitigation.damageType === 'PHYSICAL'
      ? mitigation.defenseIgnoreFixed
      : mitigation.damageType === 'ARTS'
        ? mitigation.resistanceIgnoreFixed
        : 0,
    appliedMitigationStat: mitigation.damageType === 'PHYSICAL'
      ? mitigation.appliedDefense
      : mitigation.damageType === 'ARTS'
        ? mitigation.appliedResistance
        : null,
  }
}

function getDamageSensitivityMetricScale({
  target,
  metric,
  normalAttackInterval,
  skillBreakdown,
  canShowSkillTotal,
}: {
  target: DamageSensitivityTarget
  metric: DamageSensitivityMetric
  normalAttackInterval: number
  skillBreakdown: SkillDamageBreakdown | null
  canShowSkillTotal: boolean
}): number | null {
  const effectiveMetric = getDamageSensitivityMetricForTarget(target, metric)
  if (target === 'NORMAL') {
    return effectiveMetric === 'DPS'
      ? normalAttackInterval > 0 ? 1 / normalAttackInterval : null
      : 1
  }
  if (skillBreakdown === null) return null
  if (effectiveMetric === 'DAMAGE') return skillBreakdown.hitCount
  if (effectiveMetric === 'DPS') {
    return skillBreakdown.dps !== null && skillBreakdown.attackInterval > 0
      ? skillBreakdown.hitCount / skillBreakdown.attackInterval
      : null
  }
  if (!canShowSkillTotal || skillBreakdown.total === null) return null
  if (skillBreakdown.totalMode === 'DURATION') {
    return skillBreakdown.attackInterval > 0 && skillBreakdown.duration > 0
      ? skillBreakdown.hitCount * skillBreakdown.duration / skillBreakdown.attackInterval
      : null
  }
  if (skillBreakdown.totalMode === 'AMMO') {
    return skillBreakdown.ammoCount > 0
      ? skillBreakdown.hitCount * skillBreakdown.ammoCount
      : null
  }
  if (skillBreakdown.totalMode === 'ACTIVATION') return skillBreakdown.hitCount
  return null
}

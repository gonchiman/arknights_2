import type {
  DamageCalculationBreakdown,
  DamageType,
  SkillDamageBreakdown,
  SkillTotalMode,
} from './damageCalculator'

export type DamageSensitivityMetric = 'DAMAGE' | 'DPS' | 'TOTAL'
export type DamageSensitivityTarget = 'NORMAL' | 'SKILL'

export interface DamageSensitivityBreakdown {
  target: DamageSensitivityTarget
  metric: DamageSensitivityMetric
  mitigation: DamageCalculationBreakdown
  hitCount: number
  perHit: number
  perAttack: number
  attackInterval: number
  dps: number | null
  totalMode: SkillTotalMode
  duration: number
  ammoCount: number
  total: number | null
  minimumReached: boolean
  finalValue: number
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
  const effectiveMetric = getDamageSensitivityMetricForTarget(target, metric)
  const finalValue = selectDamageSensitivityValue({
    target,
    metric,
    normalBreakdown,
    normalAttackInterval,
    skillBreakdown,
    canShowSkillTotal,
  })
  if (mitigation === null || finalValue === null) return null
  const perHit = mitigation.result
  let hitCount: number
  let perAttack: number
  let attackInterval: number
  let dps: number | null
  let totalMode: SkillTotalMode
  let duration: number
  let ammoCount: number
  let total: number | null

  if (target === 'NORMAL') {
    hitCount = 1
    perAttack = perHit
    attackInterval = normalAttackInterval
    dps = attackInterval > 0 ? perAttack / attackInterval : null
    totalMode = 'NONE'
    duration = 0
    ammoCount = 0
    total = null
  } else {
    if (skillBreakdown === null) return null
    hitCount = skillBreakdown.hitCount
    perAttack = skillBreakdown.perAttack
    attackInterval = skillBreakdown.attackInterval
    dps = skillBreakdown.dps
    totalMode = skillBreakdown.totalMode
    duration = skillBreakdown.duration
    ammoCount = skillBreakdown.ammoCount
    total = skillBreakdown.total
  }
  const minimumDamage = mitigation.minimumDamage
  const minimumTolerance = minimumDamage === null
    ? 0
    : Number.EPSILON * Math.max(1, Math.abs(mitigation.attack), Math.abs(minimumDamage), Math.abs(perHit)) * 32

  return {
    target,
    metric: effectiveMetric,
    mitigation,
    hitCount,
    perHit,
    perAttack,
    attackInterval,
    dps,
    totalMode,
    duration,
    ammoCount,
    total,
    minimumReached: minimumDamage !== null
      && minimumDamage > 0
      && perHit <= minimumDamage + minimumTolerance,
    finalValue,
  }
}

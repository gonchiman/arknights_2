export type HpComparisonBarMode = 'total' | 'breakdown' | 'composition'

export interface HpDamageBreakdown {
  normalDamage: number
  explosionDamage: number
  bodyDamage: number
}

export interface HpDamageBreakdownComponent {
  key: keyof HpDamageBreakdown
  label: string
}

/** Component order is independent of the MOD palette used by each series. */
export const HP_DAMAGE_BREAKDOWN_COMPONENTS: readonly HpDamageBreakdownComponent[] = [
  { key: 'normalDamage', label: '通常' },
  { key: 'explosionDamage', label: '爆発' },
  { key: 'bodyDamage', label: '本体' },
]

export interface HpDamageBreakdownSegment extends HpDamageBreakdownComponent {
  damage: number
  percentage: number
  start: number
  end: number
}

/** Missing or invalid components remain unavailable; totals cannot reconstruct them. */
export function getHpDamageBreakdownSegments(
  breakdown: unknown,
  mode: Exclude<HpComparisonBarMode, 'total'> = 'breakdown',
): HpDamageBreakdownSegment[] | null {
  if (breakdown === null || typeof breakdown !== 'object') return null
  const values = breakdown as Partial<HpDamageBreakdown>
  if (HP_DAMAGE_BREAKDOWN_COMPONENTS.some(({ key }) => (
    typeof values[key] !== 'number' || !Number.isFinite(values[key]) || values[key]! < 0
  ))) return null
  const total = HP_DAMAGE_BREAKDOWN_COMPONENTS.reduce((sum, { key }) => sum + values[key]!, 0)
  if (!Number.isFinite(total)) return null
  let cumulativeDamage = 0
  return HP_DAMAGE_BREAKDOWN_COMPONENTS.map((component) => {
    const damage = values[component.key]!
    const startDamage = cumulativeDamage
    cumulativeDamage += damage
    return {
      ...component,
      damage,
      percentage: total > 0 ? damage / total * 100 : 0,
      start: mode === 'composition' ? (total > 0 ? startDamage / total * 100 : 0) : startDamage,
      end: mode === 'composition' ? (total > 0 ? cumulativeDamage / total * 100 : 0) : cumulativeDamage,
    }
  })
}

export function getHpDamageBreakdownComponents(
  series: readonly { points: readonly { damageBreakdown?: unknown }[] }[],
): readonly HpDamageBreakdownComponent[] {
  const hasBody = series.some((item) => item.points.some((point) => (
    getHpDamageBreakdownSegments(point.damageBreakdown)?.some((segment) => (
      segment.key === 'bodyDamage' && segment.damage > 0
    ))
  )))
  return HP_DAMAGE_BREAKDOWN_COMPONENTS.filter(({ key }) => key !== 'bodyDamage' || hasBody)
}

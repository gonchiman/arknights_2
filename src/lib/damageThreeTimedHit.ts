import type { DamageThreeComparisonResult } from './damageCalculatorThreeComparison.ts'
import type { TimedHit, TimedAttack } from './damageThreeCombatClock.ts'

/** Only damage actually dealt by this one event belongs on the clock. DC3's
 * steady-state poison, elemental buildup, and incomplete rows require their own timelines. */
export function getTimedHit(result: DamageThreeComparisonResult): TimedHit | null {
  const { output, perAttack } = result
  if (!output || result.errors.length || output.rows.length !== 1 || output.hasUnsupportedTalentDamage
    || output.damageOverTime || output.rows[0].damageOverTimeDps != null || result.elementalBuildups.length
    || perAttack === null || !Number.isFinite(perAttack) || perAttack < 0) return null
  const components = output.rows[0].attackComponents
  const types = new Set(components.filter(component => component.expectedDamage > 0).map(component => component.damageType))
  const type = components.length ? (types.size === 1 ? [...types][0] : null) : output.damageType
  return { damage: perAttack, attribute: type === 'PHYSICAL' || type === 'ARTS' ? type : 'OTHER' }
}

export function getTimedAttack(result: DamageThreeComparisonResult): TimedAttack | null {
  const hit = getTimedHit(result)
  const interval = result.output?.attackInterval
  return hit && interval != null && Number.isFinite(interval) && interval > 0 ? { hit, interval } : null
}

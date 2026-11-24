import {
  canEvaluateDamageCalculatorThreeNormalAttack,
  DAMAGE_CALCULATOR_THREE_NORMAL_ATTACK_STAGE_ID,
} from './damageCalculatorThree.ts'
import type { DamageThreeComparisonResult } from './damageCalculatorThreeComparison.ts'
import { resolveSkillDpsFixedCycle } from './skillDpsUptime.ts'

type DamageThreeCycleAverageDps = Pick<DamageThreeComparisonResult, 'cycleAverageDps' | 'allTargetsCycleAverageDps'>

const unavailable: DamageThreeCycleAverageDps = { cycleAverageDps: null, allTargetsCycleAverageDps: null }

/** Use reviewed skill-period totals and the normal attack DPS under the same comparison settings.
 * The reviewed SP lock includes skill startup. Only the recharge seconds add normal attack damage.
 */
export function calculateDamageThreeCycleAverageDps(
  active: DamageThreeComparisonResult,
  evaluateNormal: () => DamageThreeComparisonResult,
): DamageThreeCycleAverageDps {
  const { entry, output, totalDamage, allTargetsTotalDamage, durationSeconds } = active
  if (!output || active.errors.length || totalDamage === null || allTargetsTotalDamage === null
    || !canEvaluateDamageCalculatorThreeNormalAttack(entry.skill.operatorId)) return unavailable

  const { timing } = resolveSkillDpsFixedCycle({
    entry, output, durationSeconds, skill: entry.skill, spCost: entry.structure.activationSettings.spCost,
  })
  if (!timing) return unavailable

  const normal = evaluateNormal()
  if (!normal.output || normal.errors.length || normal.entry.key !== entry.key
    || normal.entry.stageId !== DAMAGE_CALCULATOR_THREE_NORMAL_ATTACK_STAGE_ID
    || normal.output.attackKind !== 'NORMAL' || normal.output.actor
    || normal.output.hasUnsupportedTalentDamage || normal.output.damageOverTime
    || normal.output.rows[0]?.damageOverTimeDps != null
    || normal.combinedDps === null || normal.allTargetsCombinedDps === null) return unavailable

  const { fullLockSeconds, rechargeSeconds } = timing
  const cycleSeconds = fullLockSeconds + rechargeSeconds
  const cycleAverageDps = (totalDamage + normal.combinedDps * rechargeSeconds) / cycleSeconds
  const allTargetsCycleAverageDps = (allTargetsTotalDamage + normal.allTargetsCombinedDps * rechargeSeconds) / cycleSeconds
  if (![cycleAverageDps, allTargetsCycleAverageDps].every(value => Number.isFinite(value) && value >= 0)) {
    return unavailable
  }
  return { cycleAverageDps, allTargetsCycleAverageDps }
}

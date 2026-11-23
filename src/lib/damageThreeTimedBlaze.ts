import {
  evaluateDamageThreeComparisonEntry, type DamageThreeComparisonCommon, type DamageThreeComparisonEntry,
} from './damageCalculatorThreeComparison.ts'
import type { CombatSkillProfile, TimedHit } from './damageThreeCombatClock.ts'
import { getTimedHit } from './damageThreeTimedHit.ts'

/** The single ground target stays in the front tile. The cast replaces ordinary swings.
 * Measured sequence: cuts at frames 42, 72, …, 252, explosion at 270, SP unlock at 300.
 * The staged ATK bonus is estimated at each cut (especially the first four).
 * https://gameludens.com/tool/arknightsdps/verify/ (Blaze S3, RE41)
 */
export function buildTimedBlazeSkill(
  entries: readonly DamageThreeComparisonEntry[], common: DamageThreeComparisonCommon,
): CombatSkillProfile['skill'] | null {
  const cut = entries.find(entry => entry.stageId === 'normal')
  const burst = entries.find(entry => entry.stageId === 'end')
  if (!cut || !burst) return null
  const raw = cut.skill.skillLevels[cut.levelIndex]
  const maxBonus = raw?.blackboard?.find(item => item.key === 'atk')?.value
  if (raw?.duration !== 10 || typeof maxBonus !== 'number' || !Number.isFinite(maxBonus) || maxBonus < 0) return null
  const scheduledHits: { offset: number; hit: TimedHit }[] = []
  for (let step = 1; step <= 8; step++) {
    const hit = getTimedHit(evaluateDamageThreeComparisonEntry(cut, common, { 'guard.currentAtkBonus': maxBonus * step / 9 }))
    if (!hit) return null
    scheduledHits.push({ offset: (42 + (step - 1) * 30) / 30, hit })
  }
  const final = getTimedHit(evaluateDamageThreeComparisonEntry(burst, common))
  if (!final) return null
  scheduledHits.push({ offset: 9, hit: final })
  return { kind: 'DURATION', duration: raw.duration, attack: null, scheduledHits }
}

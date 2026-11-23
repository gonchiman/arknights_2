import {
  evaluateDamageThreeComparisonEntry, type DamageThreeComparisonCommon, type DamageThreeComparisonEntry,
} from './damageCalculatorThreeComparison.ts'
import { simulateDamageThreeCombat, type CombatSkillProfile } from './damageThreeCombatClock.ts'
import { buildTimedBlazeSkill } from './damageThreeTimedBlaze.ts'
import { getTimedAttack, getTimedHit } from './damageThreeTimedHit.ts'

type Timing = 'duration' | 'permanent' | 'deploy' | 'next' | 'passive-counter' | 'active-counter' | 'blaze'

// These identities cover the entire equipped skill and its normal attacks in a
// single, always-available, surviving target scenario. A new DC3 stage that
// returns damage is not automatically a repeatable event or a complete skill.
const timingByOperator: Readonly<Record<string, Readonly<Partial<Record<number, Timing>>>>> = {
  char_017_huang: { 1: 'next', 2: 'permanent', 3: 'blaze' },
  char_1019_siege2: { 1: 'next', 2: 'permanent' }, // No adjacent allied operators.
  char_1026_gvial2: { 1: 'duration', 2: 'duration', 3: 'duration' },
  char_103_angel: { 1: 'next', 2: 'duration', 3: 'duration' },
  char_1050_chen3: { 1: 'duration' },
  char_1051_headb2: { 1: 'duration' },
  char_112_siege: { 2: 'next', 3: 'duration' }, // No kills to restore extra SP.
  char_136_hsguma: { 1: 'duration', 2: 'passive-counter' },
  char_172_svrash: { 1: 'next', 3: 'duration' },
  char_197_poca: { 1: 'duration', 2: 'duration' },
  char_2013_cerber: { 1: 'next', 2: 'duration', 3: 'duration' },
  char_2014_nian: { 1: 'duration', 2: 'active-counter', 3: 'duration' },
  char_263_skadi: { 1: 'duration', 2: 'deploy', 3: 'duration' },
  char_264_f12yin: { 1: 'next', 3: 'duration' },
  char_291_aglina: { 1: 'duration' },
  char_311_mudrok: { 1: 'duration', 2: 'next' },
  char_350_surtr: { 1: 'next', 2: 'duration' },
  char_4039_horn: { 1: 'next' },
  char_4058_pepe: { 1: 'next' },
  char_4088_hodrer: { 1: 'next' },
  char_4098_vvana: { 1: 'next' }, // First charge is consumed; a target is always in reach.
  char_4145_ulpia: { 2: 'permanent' }, // The S1 anchor takes its own attack cycle.
}

type ClockSkill = CombatSkillProfile['skill']

function buildSkill(
  entries: readonly DamageThreeComparisonEntry[], timing: Timing, common: DamageThreeComparisonCommon,
): ClockSkill | null {
  if (timing === 'blaze') return buildTimedBlazeSkill(entries, common)
  if (timing === 'passive-counter') {
    const main = entries.find(entry => entry.stageId === 'normal' && entry.kind === 'NORMAL')
    const counter = entries.find(entry => entry.stageId === 'counter' && entry.kind === 'SKILL_ACTION')
    if (!main || !counter || entries.length !== 2) return null
    const attack = getTimedAttack(evaluateDamageThreeComparisonEntry(main, common))
    const hit = getTimedHit(evaluateDamageThreeComparisonEntry(counter, common))
    return attack && hit ? { kind: 'PASSIVE', attack, counter: hit } : null
  }
  if (entries.length !== 1) return null
  const entry = entries[0]
  const result = evaluateDamageThreeComparisonEntry(entry, common)
  if (timing === 'next') {
    if (entry.kind !== 'NEXT_ATTACK') return null
    const hit = getTimedHit(result)
    return hit ? { kind: 'NEXT_ATTACK', hit } : null
  }
  if (timing === 'active-counter') {
    const hit = getTimedHit(result)
    // Nian's reviewed counter row is one hit. Its duration is the whole skill's raw timer.
    const duration = entry.skill.skillLevels[entry.levelIndex]?.duration
    return hit && entry.stageId === 'counter' && entry.kind === 'SKILL_ACTION'
      && duration != null && Number.isFinite(duration) && duration > 0
      ? { kind: 'DURATION', duration, attack: null, counter: hit } : null
  }
  if (entry.kind !== 'NORMAL') return null
  const attack = getTimedAttack(result)
  if (!attack) return null
  if (timing === 'permanent') {
    const stage = entry.structure.effectStructure.stages.find(stage => stage.id === entry.stageId)
    return stage?.duration.type === 'UNTIL_EXIT' ? { kind: 'DURATION', duration: Infinity, attack } : null
  }
  // This DC3 result certifies a complete, constant stage and a finite duration.
  // Its continuous damage estimate is not used to count attacks.
  return result.totalDamage !== null && result.durationSeconds !== null
    ? { kind: 'DURATION', duration: result.durationSeconds, attack, onDeployOnly: timing === 'deploy' } : null
}

export function evaluateTimedPowerSkill(entries: readonly DamageThreeComparisonEntry[], common: DamageThreeComparisonCommon,
  seconds: number, incomingInterval: number | null) {
  const first = entries[0]
  if (!first || common.enemyCount !== 1 || !Number.isFinite(seconds) || seconds <= 0
    || (incomingInterval !== null && (!Number.isFinite(incomingInterval) || incomingInterval <= 0))) return null
  const { operatorId, skillIndex } = first.skill
  const timing = timingByOperator[operatorId]?.[skillIndex]
  if (!timing || entries.some(entry => entry.structure !== first.structure || entry.skill.operatorId !== operatorId
    || entry.skill.skillIndex !== skillIndex || entry.phaseIndex !== 2 || entry.operatorLevel !== 90 || entry.levelIndex !== 9)) return null
  const normal = getTimedAttack(evaluateDamageThreeComparisonEntry(first, common, {}, { normalAttack: true }))
  if (!normal) return null
  // Live skills and the retained structures must agree on the schedule. Stage-only
  // damage calculations can still be valid when one of these timing fields changes.
  const raw = first.skill.skillLevels[first.levelIndex]
  const { spRecovery, initialSp, spCost, maxCharges, activationMethod } = first.structure.activationSettings
  const onDeploy = timing === 'deploy' || timing === 'passive-counter'
  if (raw?.skillType !== activationMethod || !raw.spData || raw.spData.initSp !== initialSp
    || raw.spData.spCost !== spCost || (!onDeploy && (raw.spData.spType !== spRecovery
      || raw.spData.maxChargeTime !== maxCharges || !Number.isSafeInteger(maxCharges) || maxCharges < 1))) return null
  const skill = buildSkill(entries, timing, common)
  if (!skill) return null
  const recovery = spRecovery === 'INCREASE_WITH_TIME' || (onDeploy && spRecovery === 'NO_SP') ? 'AUTO'
    : spRecovery === 'INCREASE_WHEN_ATTACK' ? 'ATTACK' : spRecovery === 'INCREASE_WHEN_TAKEN_DAMAGE' ? 'DEFENSE' : null
  if (!recovery || (activationMethod === 'PASSIVE') !== onDeploy || !Number.isFinite(initialSp) || initialSp < 0
    || !Number.isFinite(spCost) || spCost < 0 || (!onDeploy && spCost === 0)) return null
  return simulateDamageThreeCombat({ normal, recovery, initialSp, cost: spCost, maxCharges: onDeploy ? undefined : maxCharges, skill },
    seconds, incomingInterval)
}

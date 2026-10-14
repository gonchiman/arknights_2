import type { SkillRecord } from '../types/skill.ts'
import { deriveSurtrDpsModel, type SurtrDpsModel, type SurtrDpsSettings } from './surtrDps.ts'
import { calculateSurtrDpsCalculation } from './surtrDpsCalculation.ts'
import { deriveSurtrRemnantAttackModel, type SurtrRemnantAttackModel } from './surtrRemnantAttacks.ts'

export interface SurtrTotalDamageModel {
  before: SurtrDpsModel
  after: SurtrDpsModel
  timing: SurtrRemnantAttackModel
}

export interface SurtrTotalDamageAssumptions {
  /** First attack start, in seconds from S3 activation; an explicit timing assumption. */
  firstAttackStart: number
  /** Fixed delay per attack; does not extend the start-to-start attack interval. */
  hitDelay: number
  ctCarry: 'time' | 'ratio'
  includeRetreatHit: boolean
}

export interface SurtrTotalDamageAttack {
  startTime: number
  hitTime: number
  /** Damage and phase are selected at impact time, including a hit exactly at activation. */
  phase: 'before' | 'remnant'
  startedBeforeRemnant: boolean
  /** Started before activation but its already scheduled impact occurs during Remnant. */
  carriedImpact: boolean
  damage: number
}

export interface SurtrTotalDamageResult {
  remnantActivationTime: number
  retreatTime: number
  remainingCtBefore: number
  remainingCtAfter: number
  /** Counted impacts only; empty when includeAttacks is false. */
  attacks: SurtrTotalDamageAttack[]
  hitsBefore: number
  hitsRemnant: number
  totalHits: number
  perHitBefore: number
  perHitRemnant: number
  damageBefore: number
  damageRemnant: number
  totalDamage: number
  firstHitTime: number | null
  lastHitTime: number | null
}

export interface SurtrTotalDamageCalculationOptions {
  /** Disable the event list for large sweeps; counts and totals are unchanged. */
  includeAttacks?: boolean
}

export const SURTR_TOTAL_DAMAGE_MAXIMUM_TIME = 3600
export const SURTR_TOTAL_DAMAGE_MAXIMUM_SAMPLES = 201
export const SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS: Readonly<SurtrTotalDamageAssumptions> = Object.freeze({
  firstAttackStart: 0.6,
  hitDelay: 0.3,
  ctCarry: 'time',
  includeRetreatHit: false,
})

const TIME_EPSILON = 1e-9
const MAXIMUM_ATTACKS = 100_000

/** Derive both S3 phases and reuse the existing module/potential Remnant duration. */
export function deriveSurtrTotalDamageModel(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  moduleId = '',
  moduleLevel = 3,
): SurtrTotalDamageModel | null {
  const before = deriveSurtrDpsModel(record, { ...settings, remnantActive: false }, moduleId, moduleLevel)
  const after = deriveSurtrDpsModel(record, { ...settings, remnantActive: true }, moduleId, moduleLevel)
  const timing = deriveSurtrRemnantAttackModel(record, settings, moduleId, moduleLevel)
  if (!before || !after || !timing) return null
  const model = { before, after, timing }
  return matchingModel(model) ? model : null
}

/**
 * Continuous-time estimate for one uninterrupted S3 against a single fixed target.
 * Talent 2's activation time is supplied directly, without simulating healing/HP.
 * Previously started attacks retain their impact time across the speed change.
 * Only the next start's remaining CT is transformed; all later starts use the
 * post-activation interval. Before any attack has started, firstAttackStart stays
 * anchored to S3 activation rather than being treated as a running attack CT.
 * Activation precedes a simultaneous attack/hit; retreat prevents simultaneous
 * starts. Post-retreat impacts are discarded, with an option for exact expiry.
 * These conventions do not claim frame-accurate native-game timing.
 */
export function calculateSurtrTotalDamage(
  model: SurtrTotalDamageModel,
  remnantActivationTime: number,
  resistance: number,
  assumptions: SurtrTotalDamageAssumptions = SURTR_TOTAL_DAMAGE_DEFAULT_ASSUMPTIONS,
  options: SurtrTotalDamageCalculationOptions = {},
): SurtrTotalDamageResult | null {
  if (!matchingModel(model) || !validTime(remnantActivationTime)
    || !validTime(assumptions.firstAttackStart) || !nonNegative(assumptions.hitDelay)
    || assumptions.hitDelay > Math.min(model.timing.attackIntervalBefore, model.timing.attackIntervalAfter) + TIME_EPSILON
    || !['time', 'ratio'].includes(assumptions.ctCarry)
    || typeof assumptions.includeRetreatHit !== 'boolean'
    || (options.includeAttacks !== undefined && typeof options.includeAttacks !== 'boolean')) return null
  const beforeDamage = calculateSurtrDpsCalculation(model.before, resistance)
  const afterDamage = calculateSurtrDpsCalculation(model.after, resistance)
  if (!beforeDamage || !afterDamage) return null

  const { attackIntervalBefore, attackIntervalAfter, remnantDuration } = model.timing
  const retreatTime = remnantActivationTime + remnantDuration
  if (!Number.isFinite(retreatTime)) return null
  // Count starts strictly before activation, including safe decimal boundaries.
  const beforeStarts = Math.max(0, Math.ceil(
    (remnantActivationTime - assumptions.firstAttackStart - TIME_EPSILON) / attackIntervalBefore,
  ))
  if (!Number.isSafeInteger(beforeStarts) || beforeStarts > MAXIMUM_ATTACKS) return null
  const plannedNextStart = assumptions.firstAttackStart + beforeStarts * attackIntervalBefore
  const remainingCtBefore = Math.max(0, plannedNextStart - remnantActivationTime)
  const remainingCtAfter = beforeStarts > 0 && assumptions.ctCarry === 'ratio'
    ? remainingCtBefore / attackIntervalBefore * attackIntervalAfter
    : remainingCtBefore
  const nextStart = boundaryTime(remnantActivationTime + remainingCtAfter, remnantActivationTime, retreatTime)
  // Even includeRetreatHit does not permit a new attack to start at retreat.
  const afterStarts = Math.max(0, Math.ceil((retreatTime - nextStart - TIME_EPSILON) / attackIntervalAfter))
  if (!Number.isSafeInteger(afterStarts) || beforeStarts + afterStarts > MAXIMUM_ATTACKS) return null

  const attacks: SurtrTotalDamageAttack[] = []
  let hitsBefore = 0
  let hitsRemnant = 0
  let firstHitTime: number | null = null
  let lastHitTime: number | null = null
  const append = (rawStartTime: number, startedBeforeRemnant: boolean) => {
    const startTime = boundaryTime(rawStartTime, remnantActivationTime, retreatTime)
    if (startTime >= retreatTime - TIME_EPSILON) return
    const hitTime = boundaryTime(startTime + assumptions.hitDelay, remnantActivationTime, retreatTime)
    const atRetreat = Math.abs(hitTime - retreatTime) <= TIME_EPSILON
    if (hitTime > retreatTime + TIME_EPSILON || (atRetreat && !assumptions.includeRetreatHit)) return
    const phase = hitTime < remnantActivationTime - TIME_EPSILON ? 'before' : 'remnant'
    if (phase === 'before') hitsBefore += 1
    else hitsRemnant += 1
    firstHitTime = firstHitTime === null ? hitTime : Math.min(firstHitTime, hitTime)
    lastHitTime = lastHitTime === null ? hitTime : Math.max(lastHitTime, hitTime)
    if (options.includeAttacks !== false) attacks.push({
      startTime,
      hitTime,
      phase,
      startedBeforeRemnant,
      carriedImpact: startedBeforeRemnant && phase === 'remnant',
      damage: phase === 'before' ? beforeDamage.perHit : afterDamage.perHit,
    })
  }
  for (let index = 0; index < beforeStarts; index += 1) {
    append(assumptions.firstAttackStart + index * attackIntervalBefore, true)
  }
  for (let index = 0; index < afterStarts; index += 1) {
    append(nextStart + index * attackIntervalAfter, false)
  }
  const damageBefore = hitsBefore * beforeDamage.perHit
  const damageRemnant = hitsRemnant * afterDamage.perHit
  const totalDamage = damageBefore + damageRemnant
  if (!Number.isFinite(totalDamage)) return null
  return {
    remnantActivationTime,
    retreatTime,
    remainingCtBefore,
    remainingCtAfter,
    attacks,
    hitsBefore,
    hitsRemnant,
    totalHits: hitsBefore + hitsRemnant,
    perHitBefore: beforeDamage.perHit,
    perHitRemnant: afterDamage.perHit,
    damageBefore,
    damageRemnant,
    totalDamage,
    firstHitTime,
    lastHitTime,
  }
}

/** Regular time samples only; an end between steps is not appended. */
export function buildSurtrTotalDamageTimeSamples(start: number, end: number, step: number): number[] {
  if (!validTime(start) || !validTime(end) || end < start
    || !positive(step) || step < 0.01 || step > SURTR_TOTAL_DAMAGE_MAXIMUM_TIME) return []
  const quotient = (end - start) / step
  const nearest = Math.round(quotient)
  const fullSteps = Math.floor(Math.abs(quotient - nearest) <= Number.EPSILON * Math.max(1, Math.abs(quotient)) * 8
    ? nearest : quotient)
  if (!Number.isSafeInteger(fullSteps) || fullSteps + 1 > SURTR_TOTAL_DAMAGE_MAXIMUM_SAMPLES) return []
  const samples = Array.from({ length: fullSteps + 1 }, (_, index) => Number((start + index * step).toFixed(9)))
  return samples.every((time, index) => time >= start - TIME_EPSILON && time <= end + TIME_EPSILON
    && (index === 0 || time > samples[index - 1])) ? samples : []
}

function matchingModel(model: SurtrTotalDamageModel): boolean {
  const { before, after, timing } = model
  return [before, after].every((phase) => phase.moduleId === timing.moduleId
    && phase.moduleType === timing.moduleType && phase.moduleLevel === timing.moduleLevel)
    && before.skillLevelIndex === after.skillLevelIndex
    && before.remnantActive === false && after.remnantActive === true
    && sameNumber(before.attackInterval, timing.attackIntervalBefore)
    && sameNumber(after.attackInterval, timing.attackIntervalAfter)
    && sameNumber(before.attackSpeed, timing.attackSpeedBefore)
    && sameNumber(after.attackSpeed, timing.attackSpeedAfter)
    && positive(timing.attackIntervalBefore) && positive(timing.attackIntervalAfter)
    && positive(timing.attackSpeedBefore) && positive(timing.attackSpeedAfter)
    && positive(timing.remnantDuration) && timing.remnantDuration <= SURTR_TOTAL_DAMAGE_MAXIMUM_TIME
}

function boundaryTime(value: number, activation: number, retreat: number): number {
  if (Math.abs(value - activation) <= TIME_EPSILON) return activation
  if (Math.abs(value - retreat) <= TIME_EPSILON) return retreat
  return value
}

function sameNumber(first: number, second: number): boolean {
  return Number.isFinite(first) && Number.isFinite(second)
    && Math.abs(first - second) <= Number.EPSILON * Math.max(1, Math.abs(first), Math.abs(second)) * 8
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validTime(value: unknown): value is number {
  return nonNegative(value) && value <= SURTR_TOTAL_DAMAGE_MAXIMUM_TIME
}

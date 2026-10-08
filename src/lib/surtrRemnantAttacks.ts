import type { SkillRecord } from '../types/skill.ts'
import { deriveSurtrDpsModel, type SurtrDpsSettings } from './surtrDps.ts'
import { deriveSurtrDurationModel } from './surtrDuration.ts'

export interface SurtrRemnantAttackModel {
  moduleId: string
  moduleType: 'X' | 'Y' | null
  moduleLevel: number
  attackIntervalBefore: number
  attackIntervalAfter: number
  remnantDuration: number
  attackSpeedBefore: number
  attackSpeedAfter: number
}

export interface SurtrRemnantAttackAssumptions {
  /** Post-activation seconds from attack start to impact; not scaled by ctCarry. */
  windup: number
  ctCarry: 'time' | 'ratio'
  includeRetreatHit: boolean
}

export interface SurtrRemnantAttackResult {
  /** Seconds until the next attack starts, immediately before Remnant activates. */
  remainingCtBefore: number
  /** Seconds until the next attack starts, after the chosen CT carry assumption. */
  remainingCtAfter: number
  /** Actual impacts inside the chosen Remnant window, relative to its activation. */
  firstHitTime: number | null
  lastHitTime: number | null
  hitTimes: number[]
  hitCount: number
}

export type SurtrRemnantCtStep = 0.01 | 0.05 | 0.1

const TIME_EPSILON = 1e-9
const MAXIMUM_ITEMS = 100_000

/** Reuse the existing S3 stat and duration validation, then apply Remnant's speed. */
export function deriveSurtrRemnantAttackModel(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  moduleId = '',
  moduleLevel = 3,
): SurtrRemnantAttackModel | null {
  const before = deriveSurtrDpsModel(record, { ...settings, remnantActive: false }, moduleId, moduleLevel)
  const after = deriveSurtrDpsModel(record, { ...settings, remnantActive: true }, moduleId, moduleLevel)
  const duration = deriveSurtrDurationModel(record, settings, moduleId, moduleLevel)
  if (!before || !after || !duration) return null
  const model: SurtrRemnantAttackModel = {
    moduleId: before.moduleId,
    moduleType: before.moduleType,
    moduleLevel: before.moduleLevel,
    attackIntervalBefore: before.attackInterval,
    attackIntervalAfter: after.attackInterval,
    remnantDuration: duration.remnantDuration,
    attackSpeedBefore: before.attackSpeed,
    attackSpeedAfter: after.attackSpeed,
  }
  return validModel(model) ? model : null
}

/**
 * Continuous-time estimate: Remnant activates while waiting for the next attack.
 * It neither models an attack already in progress nor quantizes game frames.
 * The initial CT and windup are separate; only CT follows the chosen carry rule.
 */
export function calculateSurtrRemnantAttacks(
  model: SurtrRemnantAttackModel,
  remainingCt: number,
  assumptions: SurtrRemnantAttackAssumptions,
): SurtrRemnantAttackResult | null {
  if (!validModel(model) || !nonNegative(remainingCt)
    || remainingCt > model.attackIntervalBefore + TIME_EPSILON
    || !nonNegative(assumptions.windup)
    || assumptions.windup > model.attackIntervalAfter + TIME_EPSILON
    || !['time', 'ratio'].includes(assumptions.ctCarry)
    || typeof assumptions.includeRetreatHit !== 'boolean') return null
  const remainingCtBefore = Math.min(remainingCt, model.attackIntervalBefore)
  const remainingCtAfter = assumptions.ctCarry === 'ratio'
    ? remainingCtBefore / model.attackIntervalBefore * model.attackIntervalAfter
    : remainingCtBefore
  const first = remainingCtAfter + Math.min(assumptions.windup, model.attackIntervalAfter)
  if (!nonNegative(remainingCtAfter) || !nonNegative(first)) return null
  const maximumHits = Math.ceil(model.remnantDuration / model.attackIntervalAfter) + 1
  if (!Number.isSafeInteger(maximumHits) || maximumHits > MAXIMUM_ITEMS) return null
  const hitTimes: number[] = []
  for (let index = 0; index < maximumHits; index += 1) {
    const time = first + index * model.attackIntervalAfter
    const atRetreat = Math.abs(time - model.remnantDuration) <= TIME_EPSILON
    if (atRetreat) {
      if (assumptions.includeRetreatHit) hitTimes.push(model.remnantDuration)
      break
    }
    if (time > model.remnantDuration) break
    hitTimes.push(time)
  }
  return {
    remainingCtBefore,
    remainingCtAfter,
    firstHitTime: hitTimes[0] ?? null,
    lastHitTime: hitTimes.at(-1) ?? null,
    hitTimes,
    hitCount: hitTimes.length,
  }
}

/** Largest selected pre-activation interval, rounded down to a hundredth of a second. */
export function getSurtrRemnantCtLimit(models: readonly SurtrRemnantAttackModel[]): number | null {
  return intervalLimit(models, 'attackIntervalBefore', 'max')
}

/** Largest common post-activation windup with no overlap with the next attack. */
export function getSurtrRemnantWindupLimit(models: readonly SurtrRemnantAttackModel[]): number | null {
  return intervalLimit(models, 'attackIntervalAfter', 'min')
}

/** Regular decimal samples use integer hundredths and never exceed the limit. */
export function buildSurtrRemnantCtSamples(limit: number, step: SurtrRemnantCtStep): number[] {
  if (!nonNegative(limit) || ![0.01, 0.05, 0.1].includes(step)) return []
  const stepHundredths = Math.round(step * 100)
  const fullSteps = floorWithoutRoundoff(limit * 100 / stepHundredths)
  if (!Number.isSafeInteger(fullSteps) || fullSteps + 1 > MAXIMUM_ITEMS) return []
  return Array.from({ length: fullSteps + 1 }, (_, index) => index * stepHundredths / 100)
    .filter((value) => value <= limit)
}

function intervalLimit(
  models: readonly SurtrRemnantAttackModel[],
  key: 'attackIntervalBefore' | 'attackIntervalAfter',
  extremum: 'min' | 'max',
): number | null {
  if (!models.length || models.some((model) => !validModel(model))) return null
  const interval = Math[extremum](...models.map((model) => model[key]))
  const hundredths = floorWithoutRoundoff(interval * 100)
  if (!Number.isSafeInteger(hundredths)) return null
  return hundredths / 100
}

function floorWithoutRoundoff(value: number): number {
  const nearest = Math.round(value)
  // Decimal input such as 0.29 can become 28.999999999999996 after scaling.
  return Math.floor(Math.abs(value - nearest) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 2
    ? nearest : value)
}

function validModel(model: SurtrRemnantAttackModel): boolean {
  return positive(model.attackIntervalBefore) && positive(model.attackIntervalAfter)
    && positive(model.remnantDuration) && positive(model.attackSpeedBefore) && positive(model.attackSpeedAfter)
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

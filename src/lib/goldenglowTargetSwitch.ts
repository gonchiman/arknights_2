import { calculateDamageBreakdown } from './damageCalculator.ts'
import {
  calculateGoldenglowExplosionDamage,
  getGoldenglowDroneAttackScalePercent,
  getGoldenglowNextExplosionChancePercent,
  type GoldenglowExplosionModel,
} from './goldenglowExplosion.ts'

export const GOLDENGLOW_TARGET_SWITCH_LIMITS = {
  maxDuration: 300,
  minAttackInterval: 0.05,
  maxAttackInterval: 300,
  maxTrials: 20_000,
  maxEnemyHp: 1_000_000_000,
  maxEffectiveAttack: 1_000_000,
  maxEnemyDefense: 1_000_000,
  maxEnemyResistance: 100,
  maxSwitchDelay: 5,
  maxSeed: 0xffffffff,
  maxDroneCount: 16,
  maxDroneOpportunities: 20_000_000,
} as const

export interface GoldenglowTargetSwitchInput {
  model: GoldenglowExplosionModel
  skillIndex: number
  effectiveAttack: number
  attackInterval: number
  /** S2 also uses a finite observation window after activation. */
  duration: number
  enemyHp: number
  enemyDefense: number
  enemyResistance: number
  /** Extra seconds before the next volley following a kill. */
  switchDelay: number
  trials: number
  seed: number
}

/** Damage values are after mitigation; raw means before the remaining-HP cap. */
export interface GoldenglowTargetSwitchTotals {
  effectiveDamage: number
  rawDamage: number
  overkillDamage: number
  effectiveDps: number
  rawDps: number
  kills: number
  explosions: number
  normalDamage: number
  explosionDamage: number
  bodyDamage: number
  volleys: number
}

export interface GoldenglowTargetSwitchTraceRow {
  time: number
  targetNumber: number
  hpBefore: number
  hpAfter: number
  normalDamage: number
  explosionDamage: number
  bodyDamage: number
  rawDamage: number
  effectiveDamage: number
  overkillDamage: number
  killed: boolean
  explosions: number
}

export interface GoldenglowTargetSwitchTrial {
  totals: GoldenglowTargetSwitchTotals
  trace: GoldenglowTargetSwitchTraceRow[]
}

export interface GoldenglowTargetSwitchTimelinePoint {
  time: number
  effectiveDamage: number
  rawDamage: number
  baselineRawDamage: number
  kills: number
}

export interface GoldenglowTargetSwitchResult {
  trials: number
  seed: number
  duration: number
  mean: GoldenglowTargetSwitchTotals
  /** Sampling error of the mean effective DPS, not trial-to-trial variation. */
  dpsStandardError: number | null
  /** Normal-approximation 95% interval; unavailable for a single trial. */
  dpsConfidence95: { lower: number; upper: number } | null
  /** Empirical per-trial effective DPS percentiles, linearly interpolated. */
  dpsPercentiles: { p10: number; p50: number; p90: number }
  /** Same model/seeds and full normal-attack ramp, against an immortal target. */
  baseline: { rawDamage: number; rawDps: number }
  /** Mean cumulative output, including time zero and the observation endpoint. */
  timeline: GoldenglowTargetSwitchTimelinePoint[]
  /** The first trial, never an averaged or representative trace. */
  sample: GoldenglowTargetSwitchTrial
}

interface PreparedSimulation {
  input: GoldenglowTargetSwitchInput
  normalDamageByStack: number[]
  explosionDamage: number
  bodyDamage: number
  explosionChances: number[]
  timeTolerance: number
}

/**
 * Simulates each kill before averaging complete independent trials. All drone
 * and body attacks form one synchronous volley on the original target. Damage
 * beyond its HP never transfers. The first volley lands at attackInterval and
 * only complete volleys at or before duration count. Travel/return time is zero;
 * switchDelay is the explicit extra delay after a kill.
 *
 * Each drone has independent PRD misses and normal-attack ramp stacks. Explosion
 * replaces its normal attack and resets PRD alone; a target change resets every
 * drone's ramp alone. All drones begin with zero misses and zero ramp stacks.
 */
export function simulateGoldenglowTargetSwitch(
  input: GoldenglowTargetSwitchInput,
): GoldenglowTargetSwitchResult {
  const prepared = prepareSimulation(input)
  const timeline = createTimeline(input.duration)
  const total = emptyTotals()
  const dpsValues: number[] = []
  let baselineDamage = 0
  let runningDpsMean = 0
  let dpsSquaredDifferences = 0
  let sample: GoldenglowTargetSwitchTrial | undefined

  for (let trialIndex = 0; trialIndex < input.trials; trialIndex += 1) {
    const trialSeed = (input.seed + Math.imul(trialIndex, 0x9e3779b9)) >>> 0
    const trial = runTrial(prepared, seededRandom(trialSeed), false, trialIndex === 0, timeline)
    const baseline = runTrial(prepared, seededRandom(trialSeed), true, false, timeline)
    if (trialIndex === 0) sample = trial
    addTotals(total, trial.totals)
    baselineDamage += baseline.totals.rawDamage
    dpsValues.push(trial.totals.effectiveDps)
    const difference = trial.totals.effectiveDps - runningDpsMean
    runningDpsMean += difference / (trialIndex + 1)
    dpsSquaredDifferences += difference * (trial.totals.effectiveDps - runningDpsMean)
  }

  const mean = divideTotals(total, input.trials)
  const dpsStandardError = input.trials > 1
    ? Math.sqrt(Math.max(0, dpsSquaredDifferences) / (input.trials - 1) / input.trials)
    : null
  dpsValues.sort((left, right) => left - right)
  for (const point of timeline) {
    point.effectiveDamage /= input.trials
    point.rawDamage /= input.trials
    point.baselineRawDamage /= input.trials
    point.kills /= input.trials
  }
  return {
    trials: input.trials,
    seed: input.seed,
    duration: input.duration,
    mean,
    dpsStandardError,
    dpsConfidence95: dpsStandardError === null ? null : {
      lower: Math.max(0, mean.effectiveDps - 1.96 * dpsStandardError),
      upper: mean.effectiveDps + 1.96 * dpsStandardError,
    },
    dpsPercentiles: {
      p10: percentile(dpsValues, 0.1),
      p50: percentile(dpsValues, 0.5),
      p90: percentile(dpsValues, 0.9),
    },
    baseline: {
      rawDamage: baselineDamage / input.trials,
      rawDps: baselineDamage / input.trials / input.duration,
    },
    timeline,
    sample: sample!,
  }
}

/** Runs a single inspectable trial. Optional uniform RNG is for controlled tests. */
export function simulateGoldenglowTargetSwitchTrial(
  input: GoldenglowTargetSwitchInput,
  random?: () => number,
): GoldenglowTargetSwitchTrial {
  const prepared = prepareSimulation(input)
  const source = random ?? seededRandom(input.seed)
  const checkedRandom = () => {
    const value = source()
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError('random は 0 以上 1 未満の有限値を返す必要があります。')
    }
    return value
  }
  return runTrial(prepared, checkedRandom, false, true)
}

function runTrial(
  prepared: PreparedSimulation,
  random: () => number,
  immortalTarget: boolean,
  recordTrace: boolean,
  timeline?: GoldenglowTargetSwitchTimelinePoint[],
): GoldenglowTargetSwitchTrial {
  const { input, normalDamageByStack, explosionDamage, bodyDamage, explosionChances } = prepared
  const misses = new Uint16Array(input.model.activeDroneCount)
  const normalStacks = new Uint16Array(input.model.activeDroneCount)
  const totals = emptyTotals()
  const trace: GoldenglowTargetSwitchTraceRow[] = []
  let hp = input.enemyHp
  let timelineIndex = 0

  const addTimelinePoint = () => {
    const point = timeline![timelineIndex++]
    if (immortalTarget) {
      point.baselineRawDamage += totals.rawDamage
    } else {
      point.effectiveDamage += totals.effectiveDamage
      point.rawDamage += totals.rawDamage
      point.kills += totals.kills
    }
  }

  while (true) {
    // Multiplication avoids accumulating floating-point timing drift each volley.
    const nextTime = (totals.volleys + 1) * input.attackInterval
      + (immortalTarget ? 0 : totals.kills * input.switchDelay)
    if (nextTime > input.duration + prepared.timeTolerance) break
    const time = Math.min(nextTime, input.duration)
    while (timeline && timelineIndex < timeline.length
      && timeline[timelineIndex].time < time - prepared.timeTolerance) addTimelinePoint()

    let normalDamage = 0
    let volleyExplosionDamage = 0
    let explosions = 0
    for (let droneIndex = 0; droneIndex < misses.length; droneIndex += 1) {
      if (random() < explosionChances[misses[droneIndex]]) {
        volleyExplosionDamage += explosionDamage
        explosions += 1
        misses[droneIndex] = 0
      } else {
        normalDamage += normalDamageByStack[normalStacks[droneIndex]]
        normalStacks[droneIndex] = Math.min(normalStacks[droneIndex] + 1, input.model.droneMaxStack)
        misses[droneIndex] = Math.min(misses[droneIndex] + 1, input.model.prdMaxStack)
      }
    }

    const rawDamage = normalDamage + volleyExplosionDamage + bodyDamage
    const effectiveDamage = immortalTarget ? rawDamage : Math.min(hp, rawDamage)
    const hpRemainder = immortalTarget ? hp : Math.max(0, hp - effectiveDamage)
    // Decimal HP/attack values can leave a few rounding bits after an exact kill.
    // Restrict tolerance to the comparison: never credit more damage than landed,
    // and avoid an absolute epsilon floor that could erase genuinely small HP.
    const killTolerance = Number.EPSILON * Math.max(hp, rawDamage) * 4
    const killed = !immortalTarget && rawDamage > 0 && hpRemainder <= killTolerance
    const hpAfter = killed ? 0 : hpRemainder
    const overkillDamage = rawDamage - effectiveDamage
    if (recordTrace) {
      trace.push({
        time,
        targetNumber: totals.kills + 1,
        hpBefore: hp,
        hpAfter,
        normalDamage,
        explosionDamage: volleyExplosionDamage,
        bodyDamage,
        rawDamage,
        effectiveDamage,
        overkillDamage,
        killed,
        explosions,
      })
    }
    totals.normalDamage += normalDamage
    totals.explosionDamage += volleyExplosionDamage
    totals.bodyDamage += bodyDamage
    totals.rawDamage += rawDamage
    totals.effectiveDamage += effectiveDamage
    totals.overkillDamage += overkillDamage
    totals.explosions += explosions
    totals.volleys += 1
    if (killed) {
      totals.kills += 1
      hp = input.enemyHp
      normalStacks.fill(0)
    } else {
      hp = hpAfter
    }
  }

  while (timeline && timelineIndex < timeline.length) addTimelinePoint()
  totals.effectiveDps = totals.effectiveDamage / input.duration
  totals.rawDps = totals.rawDamage / input.duration
  return { totals, trace }
}

function prepareSimulation(input: GoldenglowTargetSwitchInput): PreparedSimulation {
  validateInput(input)
  const { model, effectiveAttack, enemyDefense, enemyResistance } = input
  const normalDamageByStack = Array.from({ length: model.droneMaxStack + 1 }, (_, stack) => (
    calculateDamageBreakdown(
      effectiveAttack * getGoldenglowDroneAttackScalePercent(stack + 1, model) / 100,
      'ARTS', enemyDefense, enemyResistance,
      { resistanceIgnoreFixed: model.resistanceIgnoreFixed },
    ).result
  ))
  return {
    input,
    normalDamageByStack,
    explosionDamage: calculateGoldenglowExplosionDamage(
      effectiveAttack, enemyDefense, enemyResistance, model,
    ).damageAfterMitigation,
    bodyDamage: input.skillIndex === 3 ? 0 : calculateDamageBreakdown(
      effectiveAttack, 'ARTS', enemyDefense, enemyResistance,
      { resistanceIgnoreFixed: model.resistanceIgnoreFixed },
    ).result,
    explosionChances: Array.from({ length: model.prdMaxStack + 1 }, (_, misses) => (
      getGoldenglowNextExplosionChancePercent(misses, model) / 100
    )),
    timeTolerance: Number.EPSILON * Math.max(1, input.duration, input.attackInterval) * 32,
  }
}

function validateInput(input: GoldenglowTargetSwitchInput): void {
  const limits = GOLDENGLOW_TARGET_SWITCH_LIMITS
  bounded('skillIndex', input.skillIndex, 1, 3, true)
  bounded('effectiveAttack', input.effectiveAttack, 0, limits.maxEffectiveAttack)
  bounded('attackInterval', input.attackInterval, limits.minAttackInterval, limits.maxAttackInterval)
  positiveBounded('duration', input.duration, limits.maxDuration)
  positiveBounded('enemyHp', input.enemyHp, limits.maxEnemyHp)
  bounded('enemyDefense', input.enemyDefense, 0, limits.maxEnemyDefense)
  bounded('enemyResistance', input.enemyResistance, 0, limits.maxEnemyResistance)
  bounded('switchDelay', input.switchDelay, 0, limits.maxSwitchDelay)
  bounded('trials', input.trials, 1, limits.maxTrials, true)
  bounded('seed', input.seed, 0, limits.maxSeed, true)
  const model = input.model
  if (!model || model.damageType !== 'ARTS') throw new RangeError('model.damageType は ARTS が必要です。')
  bounded('model.activeDroneCount', model.activeDroneCount, 1, limits.maxDroneCount, true)
  bounded('model.attackScale', model.attackScale, 0, 100)
  bounded('model.resistanceIgnoreFixed', model.resistanceIgnoreFixed, 0, 1_000)
  bounded('model.prdStep', model.prdStep, 0, 1)
  bounded('model.prdMaxStack', model.prdMaxStack, 1, 1_000, true)
  bounded('model.droneInitialAttackScale', model.droneInitialAttackScale, 0, 100)
  bounded('model.droneAttackScaleStep', model.droneAttackScaleStep, 0, 100)
  bounded('model.droneMaxAttackScale', model.droneMaxAttackScale, model.droneInitialAttackScale, 100)
  bounded('model.droneMaxStack', model.droneMaxStack, 0, 1_000, true)
  const volleyLimit = Math.floor(input.duration / input.attackInterval + 1e-9)
  if (volleyLimit * input.trials * model.activeDroneCount * 2 > limits.maxDroneOpportunities) {
    throw new RangeError('計算量の上限を超えています。trials または duration を減らしてください。')
  }
}

function bounded(name: string, value: number, min: number, max: number, integer = false): void {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new RangeError(`${name} は ${min} 以上 ${max} 以下の${integer ? '整数' : '有限値'}で指定してください。`)
  }
}

function positiveBounded(name: string, value: number, max: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    throw new RangeError(`${name} は 0 より大きく ${max} 以下の有限値で指定してください。`)
  }
}

function createTimeline(duration: number): GoldenglowTargetSwitchTimelinePoint[] {
  const segments = Math.min(120, Math.ceil(duration))
  return Array.from({ length: segments + 1 }, (_, index) => ({
    time: duration * index / segments,
    effectiveDamage: 0,
    rawDamage: 0,
    baselineRawDamage: 0,
    kills: 0,
  }))
}

function emptyTotals(): GoldenglowTargetSwitchTotals {
  return {
    effectiveDamage: 0, rawDamage: 0, overkillDamage: 0,
    effectiveDps: 0, rawDps: 0, kills: 0, explosions: 0,
    normalDamage: 0, explosionDamage: 0, bodyDamage: 0, volleys: 0,
  }
}

function addTotals(target: GoldenglowTargetSwitchTotals, source: GoldenglowTargetSwitchTotals): void {
  for (const key of Object.keys(target) as (keyof GoldenglowTargetSwitchTotals)[]) target[key] += source[key]
}

function divideTotals(total: GoldenglowTargetSwitchTotals, divisor: number): GoldenglowTargetSwitchTotals {
  const mean = emptyTotals()
  for (const key of Object.keys(mean) as (keyof GoldenglowTargetSwitchTotals)[]) mean[key] = total[key] / divisor
  return mean
}

function percentile(sorted: number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

/** Mulberry32; trial seeds are derived independently so trial-count changes keep the first trace. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}

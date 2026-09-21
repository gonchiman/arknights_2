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

/** Trusted execution policy, kept separate from user/worker simulation inputs. */
export interface GoldenglowTargetSwitchExecutionOptions {
  /** Only the dedicated benchmark opts in; every other resource limit remains. */
  trialLimit?: 'benchmark'
}

export const GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS = 100_000

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
  /** Retargeting wait after a kill; overlaps each actor's remaining cooldown. Legacy mode adds it to the next volley. */
  switchDelay: number
  /** Provisional model with independent actor readiness and sequential target changes. */
  retargetRemainingDrones?: boolean
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
  bodyAttacks: number
  droneAttacks: number
  /** Timestamp groups in the independent model; synchronous volleys in legacy mode. */
  volleys: number
}

export interface GoldenglowTargetSwitchDroneTrace {
  /** One-based, stable across all volleys in the trial. */
  droneNumber: number
  normalStackBefore: number
  /** State for the next attack, including a reset when this volley kills. */
  normalStackAfter: number
  missesBefore: number
  missesAfter: number
  /** The would-be normal-attack multiplier before choosing normal or explosion. */
  normalScalePercent: number
  explosionChancePercent: number
  rollPercent: number
  exploded: boolean
  /** After resistance, before the attacked target's remaining-HP cap. */
  damage: number
}

export interface GoldenglowTargetSwitchAttackTrace {
  actor: 'body' | 'drone'
  droneNumber?: number
  targetNumber: number
  hpBefore: number
  hpAfter: number
  damage: number
  effectiveDamage: number
  overkillDamage: number
  killed: boolean
}

export interface GoldenglowTargetSwitchDelayTrace {
  actor: 'body' | 'drone'
  droneNumber?: number
  /** The target defeated by the attack that caused this postponement. */
  targetNumber: number
  nextTargetNumber: number
  causeActor: 'body' | 'drone'
  causeDroneNumber?: number
  /** Zero-based index into this trace row's attacks. */
  causeAttackIndex: number
  /** Scheduled next attack time immediately before the postponement. */
  previousAttackTime: number
  /** Updated schedule, which may fall after the observation endpoint. */
  nextAttackTime: number
  /** Additional wait beyond the actor's already scheduled attack time. */
  addedDelay: number
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
  /** Number of enemies defeated at this timestamp. */
  kills: number
  nextTargetNumber: number
  nextTargetHp: number
  explosions: number
  drones: GoldenglowTargetSwitchDroneTrace[]
  /** Only attacks that actually land at this timestamp, in actor order. */
  attacks?: GoldenglowTargetSwitchAttackTrace[]
  /** Actual schedule postponements caused by kills at this timestamp. */
  delays?: GoldenglowTargetSwitchDelayTrace[]
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

export interface GoldenglowTargetSwitchPreparedSimulation {
  input: GoldenglowTargetSwitchInput
  normalDamageByStack: number[]
  explosionDamage: number
  bodyDamage: number
  explosionChances: number[]
  timeTolerance: number
}

/**
 * Simulates each kill before averaging complete independent trials. All drone
 * and body attacks normally form one synchronous volley on the original target.
 * With retargetRemainingDrones enabled, actors have independent attack clocks.
 * A kill changes all actors' target and moves each next attack to the later of
 * its scheduled time and kill time + switchDelay. Each cooldown then starts at
 * that actor's actual attack time. Ties resolve body (S1/S2), then drone number.
 * This is a provisional model, not established game logic. Damage beyond one
 * target's HP never transfers. First attacks land at attackInterval, and only
 * attacks at or before duration count. Legacy mode adds switchDelay once after
 * each killing volley; the immortal baseline keeps its original cadence.
 *
 * Each drone has independent PRD misses and normal-attack ramp stacks. Explosion
 * replaces its normal attack and resets PRD alone; a target change resets every
 * drone's ramp alone. All drones begin with zero misses and zero ramp stacks.
 */
export function simulateGoldenglowTargetSwitch(
  input: GoldenglowTargetSwitchInput,
): GoldenglowTargetSwitchResult {
  const prepared = prepareGoldenglowTargetSwitchSimulation(input)
  const timeline = createTimeline(input.duration)
  const total = emptyTotals()
  const dpsValues: number[] = []
  let baselineDamage = 0
  let runningDpsMean = 0
  let dpsSquaredDifferences = 0
  let sample: GoldenglowTargetSwitchTrial | undefined

  for (let trialIndex = 0; trialIndex < input.trials; trialIndex += 1) {
    const trialSeed = (input.seed + Math.imul(trialIndex, 0x9e3779b9)) >>> 0
    const trial = runTrial(prepared, createGoldenglowTargetSwitchRandom(trialSeed), false, trialIndex === 0, timeline)
    const baseline = runTrial(prepared, createGoldenglowTargetSwitchRandom(trialSeed), true, false, timeline)
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
  const prepared = prepareGoldenglowTargetSwitchSimulation(input)
  const source = random ?? createGoldenglowTargetSwitchRandom(input.seed)
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
  prepared: GoldenglowTargetSwitchPreparedSimulation,
  random: () => number,
  immortalTarget: boolean,
  recordTrace: boolean,
  timeline?: GoldenglowTargetSwitchTimelinePoint[],
): GoldenglowTargetSwitchTrial {
  if (!immortalTarget && prepared.input.retargetRemainingDrones) {
    const droneCount = prepared.input.model.activeDroneCount
    const rolls: number[] = []
    return runGoldenglowRetargetingTrial(prepared, (droneIndex, attackIndex) => {
      // Preserve the original ordinal-then-drone seeded stream even when actors
      // attack at different times. Cached draws do not advance any drone's PRD.
      const rowEnd = (attackIndex + 1) * droneCount
      while (rolls.length < rowEnd) rolls.push(random())
      return rolls[attackIndex * droneCount + droneIndex]
    }, recordTrace, timeline)
  }
  const { input, normalDamageByStack, explosionDamage, bodyDamage, explosionChances } = prepared
  const misses = new Uint16Array(input.model.activeDroneCount)
  const normalStacks = new Uint16Array(input.model.activeDroneCount)
  const totals = emptyTotals()
  const trace: GoldenglowTargetSwitchTraceRow[] = []
  let hp = input.enemyHp
  let killingVolleys = 0
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
      + killingVolleys * input.switchDelay
    if (nextTime > input.duration + prepared.timeTolerance) break
    const time = Math.min(nextTime, input.duration)
    while (timeline && timelineIndex < timeline.length
      && timeline[timelineIndex].time < time - prepared.timeTolerance) addTimelinePoint()

    let normalDamage = 0
    let volleyExplosionDamage = 0
    let explosions = 0
    const targetNumber = totals.kills + 1
    const hpBefore = hp
    const drones: GoldenglowTargetSwitchDroneTrace[] | undefined = recordTrace ? [] : undefined
    for (let droneIndex = 0; droneIndex < misses.length; droneIndex += 1) {
      const normalStackBefore = normalStacks[droneIndex]
      const missesBefore = misses[droneIndex]
      const explosionChance = explosionChances[missesBefore]
      const roll = random()
      const exploded = roll < explosionChance
      if (exploded) {
        volleyExplosionDamage += explosionDamage
        explosions += 1
        misses[droneIndex] = 0
      } else {
        normalDamage += normalDamageByStack[normalStacks[droneIndex]]
        normalStacks[droneIndex] = Math.min(normalStacks[droneIndex] + 1, input.model.droneMaxStack)
        misses[droneIndex] = Math.min(misses[droneIndex] + 1, input.model.prdMaxStack)
      }
      if (drones) {
        drones.push({
          droneNumber: droneIndex + 1,
          normalStackBefore,
          normalStackAfter: normalStacks[droneIndex],
          missesBefore,
          missesAfter: misses[droneIndex],
          normalScalePercent: getGoldenglowDroneAttackScalePercent(normalStackBefore + 1, input.model),
          explosionChancePercent: explosionChance * 100,
          rollPercent: roll * 100,
          exploded,
          damage: exploded ? explosionDamage : normalDamageByStack[normalStackBefore],
        })
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
    const volleyKills = killed ? 1 : 0
    hp = killed ? input.enemyHp : hpAfter
    if (killed) normalStacks.fill(0)
    if (recordTrace) {
      // A later attack can reset earlier drones' stacks; expose the final state.
      for (const drone of drones!) drone.normalStackAfter = normalStacks[drone.droneNumber - 1]
      trace.push({
        time,
        targetNumber,
        hpBefore,
        hpAfter,
        normalDamage,
        explosionDamage: volleyExplosionDamage,
        bodyDamage,
        rawDamage,
        effectiveDamage,
        overkillDamage,
        killed,
        kills: volleyKills,
        nextTargetNumber: targetNumber + volleyKills,
        nextTargetHp: hp,
        explosions,
        drones: drones!,
      })
    }
    totals.normalDamage += normalDamage
    totals.explosionDamage += volleyExplosionDamage
    totals.bodyDamage += bodyDamage
    totals.bodyAttacks += input.skillIndex === 3 ? 0 : 1
    totals.droneAttacks += misses.length
    totals.rawDamage += rawDamage
    totals.effectiveDamage += effectiveDamage
    totals.overkillDamage += overkillDamage
    totals.explosions += explosions
    totals.volleys += 1
    totals.kills += volleyKills
    if (killed) killingVolleys += 1
  }

  while (timeline && timelineIndex < timeline.length) addTimelinePoint()
  totals.effectiveDps = totals.effectiveDamage / input.duration
  totals.rawDps = totals.rawDamage / input.duration
  return { totals, trace }
}

/**
 * Independent actor clocks for the provisional retargeting model. The draw is
 * indexed by each drone's zero-based actual attack ordinal, never event groups.
 * It is called only for attacks that land; 0/1 may force precomputed PRD outcomes
 * for the mean-only grid. Callers are responsible for supplying valid draws.
 */
export function runGoldenglowRetargetingTrial(
  prepared: GoldenglowTargetSwitchPreparedSimulation,
  drawForAttack: (droneIndex: number, attackIndex: number, misses: number) => number,
  recordTrace = false,
  timeline?: GoldenglowTargetSwitchTimelinePoint[],
): GoldenglowTargetSwitchTrial {
  const { input, normalDamageByStack, explosionDamage, bodyDamage, explosionChances, timeTolerance } = prepared
  const bodyCount = input.skillIndex === 3 ? 0 : 1
  const droneCount = input.model.activeDroneCount
  const actorCount = droneCount + bodyCount
  const misses = new Uint16Array(droneCount)
  const normalStacks = new Uint16Array(droneCount)
  const attackCounts = new Uint32Array(actorCount)
  // Every event is an integer combination of the two fixed durations. Keep
  // those coefficients instead of repeatedly adding cooldowns or kill waits.
  const intervalSteps = new Uint32Array(actorCount).fill(1)
  const switchSteps = new Uint32Array(actorCount)
  const nextAttacks = new Float64Array(actorCount).fill(input.attackInterval)
  const totals = emptyTotals()
  const trace: GoldenglowTargetSwitchTraceRow[] = []
  let hp = input.enemyHp
  let timelineIndex = 0

  const addTimelinePoint = () => {
    const point = timeline![timelineIndex++]
    point.effectiveDamage += totals.effectiveDamage
    point.rawDamage += totals.rawDamage
    point.kills += totals.kills
  }

  while (true) {
    let nextTime = Infinity
    let nextActor = 0
    for (let actorIndex = 0; actorIndex < actorCount; actorIndex += 1) {
      if (nextAttacks[actorIndex] < nextTime) {
        nextTime = nextAttacks[actorIndex]
        nextActor = actorIndex
      }
    }
    if (nextTime > input.duration + timeTolerance) break
    const eventIntervalSteps = intervalSteps[nextActor]
    const eventSwitchSteps = switchSteps[nextActor]
    const time = Math.min(nextTime, input.duration)
    while (timeline && timelineIndex < timeline.length
      && timeline[timelineIndex].time < time - timeTolerance) addTimelinePoint()

    const targetNumber = totals.kills + 1
    const hpBefore = hp
    let lastTargetHpAfter = hp
    let kills = 0
    let normalDamage = 0
    let eventExplosionDamage = 0
    let eventBodyDamage = 0
    let explosions = 0
    let sequentialEffectiveDamage = 0
    const drones: GoldenglowTargetSwitchDroneTrace[] | undefined = recordTrace ? [] : undefined
    const attacks: GoldenglowTargetSwitchAttackTrace[] | undefined = recordTrace ? [] : undefined
    let delays: GoldenglowTargetSwitchDelayTrace[] | undefined

    // Read each actor's readiness again after preceding attacks: a kill can
    // postpone actors that were ready at the start of this timestamp group.
    for (let actorIndex = 0; actorIndex < actorCount; actorIndex += 1) {
      if (nextAttacks[actorIndex] > nextTime + timeTolerance) continue
      const attackIndex = attackCounts[actorIndex]
      attackCounts[actorIndex] += 1
      intervalSteps[actorIndex] = eventIntervalSteps + 1
      switchSteps[actorIndex] = eventSwitchSteps
      nextAttacks[actorIndex] = intervalSteps[actorIndex] * input.attackInterval
        + switchSteps[actorIndex] * input.switchDelay
      const droneIndex = actorIndex - bodyCount
      const isBody = droneIndex < 0
      let damage: number
      if (isBody) {
        damage = bodyDamage
        eventBodyDamage += damage
        totals.bodyAttacks += 1
      } else {
        const normalStackBefore = normalStacks[droneIndex]
        const missesBefore = misses[droneIndex]
        const explosionChance = explosionChances[missesBefore]
        const roll = drawForAttack(droneIndex, attackIndex, missesBefore)
        const exploded = roll < explosionChance
        damage = exploded ? explosionDamage : normalDamageByStack[normalStackBefore]
        if (exploded) {
          eventExplosionDamage += damage
          explosions += 1
          misses[droneIndex] = 0
        } else {
          normalDamage += damage
          normalStacks[droneIndex] = Math.min(normalStackBefore + 1, input.model.droneMaxStack)
          misses[droneIndex] = Math.min(missesBefore + 1, input.model.prdMaxStack)
        }
        totals.droneAttacks += 1
        drones?.push({
          droneNumber: droneIndex + 1,
          normalStackBefore,
          normalStackAfter: normalStacks[droneIndex],
          missesBefore,
          missesAfter: misses[droneIndex],
          normalScalePercent: getGoldenglowDroneAttackScalePercent(normalStackBefore + 1, input.model),
          explosionChancePercent: explosionChance * 100,
          rollPercent: roll * 100,
          exploded,
          damage,
        })
      }

      const attackHpBefore = hp
      const effectiveDamage = Math.min(hp, damage)
      const hpRemainder = Math.max(0, hp - effectiveDamage)
      const killTolerance = Number.EPSILON * Math.max(hp, damage) * 4
      const killed = damage > 0 && hpRemainder <= killTolerance
      lastTargetHpAfter = killed ? 0 : hpRemainder
      sequentialEffectiveDamage += effectiveDamage
      attacks?.push({
        actor: isBody ? 'body' : 'drone',
        ...(isBody ? {} : { droneNumber: droneIndex + 1 }),
        targetNumber: targetNumber + kills,
        hpBefore: attackHpBefore,
        hpAfter: lastTargetHpAfter,
        damage,
        effectiveDamage,
        overkillDamage: damage - effectiveDamage,
        killed,
      })
      if (killed) {
        kills += 1
        hp = input.enemyHp
        normalStacks.fill(0)
        const targetReadyTime = eventIntervalSteps * input.attackInterval
          + (eventSwitchSteps + 1) * input.switchDelay
        for (let waitingActor = 0; waitingActor < actorCount; waitingActor += 1) {
          if (nextAttacks[waitingActor] < targetReadyTime - timeTolerance) {
            if (recordTrace) {
              const waitingDroneIndex = waitingActor - bodyCount
              const previousAttackTime = nextAttacks[waitingActor]
              if (!delays) delays = []
              delays.push({
                actor: waitingDroneIndex < 0 ? 'body' : 'drone',
                ...(waitingDroneIndex < 0 ? {} : { droneNumber: waitingDroneIndex + 1 }),
                targetNumber: targetNumber + kills - 1,
                nextTargetNumber: targetNumber + kills,
                causeActor: isBody ? 'body' : 'drone',
                ...(isBody ? {} : { causeDroneNumber: droneIndex + 1 }),
                causeAttackIndex: attacks!.length - 1,
                previousAttackTime,
                nextAttackTime: targetReadyTime,
                addedDelay: targetReadyTime - previousAttackTime,
              })
            }
            nextAttacks[waitingActor] = targetReadyTime
            intervalSteps[waitingActor] = eventIntervalSteps
            switchSteps[waitingActor] = eventSwitchSteps + 1
          }
        }
      } else {
        hp = hpRemainder
      }
    }

    const rawDamage = normalDamage + eventExplosionDamage + eventBodyDamage
    // Component sums and sequential hit sums can differ by an ulp.
    const effectiveDamage = Math.min(rawDamage, sequentialEffectiveDamage)
    const overkillDamage = rawDamage - effectiveDamage
    if (recordTrace) {
      for (const drone of drones!) drone.normalStackAfter = normalStacks[drone.droneNumber - 1]
      trace.push({
        time, targetNumber, hpBefore, hpAfter: lastTargetHpAfter,
        normalDamage, explosionDamage: eventExplosionDamage, bodyDamage: eventBodyDamage,
        rawDamage, effectiveDamage, overkillDamage, killed: kills > 0, kills,
        nextTargetNumber: targetNumber + kills, nextTargetHp: hp,
        explosions, drones: drones!, attacks: attacks!,
        ...(delays ? { delays } : {}),
      })
    }
    totals.normalDamage += normalDamage
    totals.explosionDamage += eventExplosionDamage
    totals.bodyDamage += eventBodyDamage
    totals.rawDamage += rawDamage
    totals.effectiveDamage += effectiveDamage
    totals.overkillDamage += overkillDamage
    totals.explosions += explosions
    totals.volleys += 1
    totals.kills += kills
  }

  while (timeline && timelineIndex < timeline.length) addTimelinePoint()
  totals.effectiveDps = totals.effectiveDamage / input.duration
  totals.rawDps = totals.rawDamage / input.duration
  return { totals, trace }
}

/** Shared by the full single-condition output and the mean-only grid. */
export function prepareGoldenglowTargetSwitchSimulation(
  input: GoldenglowTargetSwitchInput,
  options?: GoldenglowTargetSwitchExecutionOptions,
): GoldenglowTargetSwitchPreparedSimulation {
  validateInput(input, options)
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

function validateInput(input: GoldenglowTargetSwitchInput, options?: GoldenglowTargetSwitchExecutionOptions): void {
  const limits = GOLDENGLOW_TARGET_SWITCH_LIMITS
  bounded('skillIndex', input.skillIndex, 1, 3, true)
  bounded('effectiveAttack', input.effectiveAttack, 0, limits.maxEffectiveAttack)
  bounded('attackInterval', input.attackInterval, limits.minAttackInterval, limits.maxAttackInterval)
  positiveBounded('duration', input.duration, limits.maxDuration)
  positiveBounded('enemyHp', input.enemyHp, limits.maxEnemyHp)
  bounded('enemyDefense', input.enemyDefense, 0, limits.maxEnemyDefense)
  bounded('enemyResistance', input.enemyResistance, 0, limits.maxEnemyResistance)
  bounded('switchDelay', input.switchDelay, 0, limits.maxSwitchDelay)
  if (input.retargetRemainingDrones !== undefined && typeof input.retargetRemainingDrones !== 'boolean') {
    throw new RangeError('retargetRemainingDrones は true または false で指定してください。')
  }
  const maxTrials = options?.trialLimit === 'benchmark' ? GOLDENGLOW_TARGET_SWITCH_BENCHMARK_MAX_TRIALS : limits.maxTrials
  bounded('trials', input.trials, 1, maxTrials, true)
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
    normalDamage: 0, explosionDamage: 0, bodyDamage: 0, bodyAttacks: 0, droneAttacks: 0, volleys: 0,
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
export function createGoldenglowTargetSwitchRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}

import type { RawSkillLevel } from '../types/skill.ts'
import {
  calculateDamageBreakdown,
  type DamageCalculationBreakdown,
} from './damageCalculator.ts'
import type { OperatorPassives, PassiveSource } from './operatorProfile.ts'

export const GOLDENGLOW_OPERATOR_ID = 'char_377_gdglow'
export const GOLDENGLOW_EXPLOSION_DAMAGE_TYPE = 'ARTS' as const

const EXPLOSION_TALENT_INDEX = 0
const RESISTANCE_IGNORE_TALENT_INDEX = 1
const BASE_DRONE_COUNT = 1
const DEFAULT_NOMINAL_CHANCE_PERCENT = 10
const DEFAULT_DRONE_INITIAL_ATTACK_SCALE = 0.2
const DEFAULT_DRONE_ATTACK_SCALE_STEP = 0.15
const DEFAULT_DRONE_MAX_ATTACK_SCALE = 1.1
const DEFAULT_DRONE_MAX_STACK = 6

export type GoldenglowExpectedDpsMode = 'FINITE_WINDOW' | 'STEADY_STATE'

export interface GoldenglowExplosionModel {
  talentName: string
  talentDescription: string
  damageType: typeof GOLDENGLOW_EXPLOSION_DAMAGE_TYPE
  attackScale: number
  attackScalePercent: number
  nominalChancePercent: number
  prdStep: number
  prdMaxStack: number
  additionalDroneCount: number
  activeDroneCount: number
  resistanceIgnoreFixed: number
  droneInitialAttackScale: number
  droneInitialAttackScalePercent: number
  droneAttackScaleStep: number
  droneAttackScaleStepPercent: number
  droneMaxAttackScale: number
  droneMaxAttackScalePercent: number
  droneMaxStack: number
}

export interface GoldenglowExplosionDamageResult {
  model: GoldenglowExplosionModel
  effectiveAttack: number
  rawExplosionDamage: number
  damageAfterMitigation: number
  breakdown: DamageCalculationBreakdown
}

export interface GoldenglowExplosionCalculationInput {
  operatorId: string
  passives: OperatorPassives
  skillLevel: RawSkillLevel | null | undefined
  effectiveAttack: number
  enemyDefense?: number
  enemyResistance?: number
}

export interface GoldenglowExpectedDamageComponent {
  expectedNormalDamage: number | null
  expectedExplosionDamage: number | null
  expectedTotalDamage: number | null
  normalDps: number
  explosionDps: number
  dps: number
  expectedExplosionCount: number | null
}

export interface GoldenglowExpectedBodyComponent {
  active: boolean
  damagePerAttack: number
  expectedTotalDamage: number | null
  dps: number
}

export interface GoldenglowExpectedDpsResult {
  model: GoldenglowExplosionModel
  mode: GoldenglowExpectedDpsMode
  attackInterval: number
  duration: number | null
  theoreticalAttackCount: number | null
  fullAttackCount: number | null
  fractionalAttackWeight: number | null
  meanAttacksPerExplosion: number
  effectiveExplosionRatePercent: number
  expectedExplosionsPerSecondPerDrone: number
  body: GoldenglowExpectedBodyComponent
  perDrone: GoldenglowExpectedDamageComponent
  allDrones: GoldenglowExpectedDamageComponent
  combinedExpectedTotalDamage: number | null
  expectedDps: number
}

export interface GoldenglowExpectedDpsCalculationInput {
  operatorId: string
  passives: OperatorPassives
  skillLevel: RawSkillLevel | null | undefined
  skillIndex: number
  effectiveAttack: number
  attackInterval: number
  duration: number
  enemyDefense?: number
  enemyResistance?: number
}

export interface GoldenglowExpectedDpsFromModelInput {
  model: GoldenglowExplosionModel
  skillIndex: number
  effectiveAttack: number
  attackInterval: number
  duration: number
  enemyDefense?: number
  enemyResistance?: number
}

/**
 * Builds the skill-active explosion model from already-selected passive data.
 * Module talent upgrades are therefore reflected by applyOperatorModule before
 * this function is called.
 */
export function deriveGoldenglowExplosionModel(
  operatorId: string,
  passives: OperatorPassives,
  skillLevel: RawSkillLevel | null | undefined,
): GoldenglowExplosionModel | null {
  if (operatorId !== GOLDENGLOW_OPERATOR_ID || !skillLevel) return null

  const explosionTalent = findTalentSource(passives, EXPLOSION_TALENT_INDEX)
  if (!explosionTalent) return null

  const attackScale = readPositiveBlackboardValue(
    explosionTalent,
    'attack@atk_scale_2',
  )
  const prdStep = readPositiveBlackboardValue(explosionTalent, 'attack@prob')
  const prdMaxStackValue = readPositiveBlackboardValue(
    explosionTalent,
    'attack@max_stack_cnt',
  )
  if (attackScale === null || prdStep === null || prdMaxStackValue === null) return null

  const additionalDroneCount = readNonNegativeSkillCount(skillLevel, 'attack@cnt')
  const resistanceIgnoreFixed = readResistanceIgnore(passives)
  const droneRamp = readDroneRamp(passives)

  return {
    talentName: explosionTalent.sourceName,
    talentDescription: explosionTalent.description,
    damageType: GOLDENGLOW_EXPLOSION_DAMAGE_TYPE,
    attackScale,
    attackScalePercent: toPercent(attackScale),
    nominalChancePercent: readNominalChancePercent(explosionTalent.description)
      ?? DEFAULT_NOMINAL_CHANCE_PERCENT,
    prdStep,
    prdMaxStack: Math.max(1, Math.round(prdMaxStackValue)),
    additionalDroneCount,
    activeDroneCount: BASE_DRONE_COUNT + additionalDroneCount,
    resistanceIgnoreFixed,
    droneInitialAttackScale: droneRamp.initialScale,
    droneInitialAttackScalePercent: toPercent(droneRamp.initialScale),
    droneAttackScaleStep: droneRamp.scaleStep,
    droneAttackScaleStepPercent: toPercent(droneRamp.scaleStep),
    droneMaxAttackScale: droneRamp.maximumScale,
    droneMaxAttackScalePercent: toPercent(droneRamp.maximumScale),
    droneMaxStack: droneRamp.maximumStack,
  }
}

/**
 * Calculates one explosion. effectiveAttack must already include the selected
 * skill's ATK modifier and module ATK so the generic attack pipeline is not
 * applied twice here.
 */
export function calculateGoldenglowExplosionDamage(
  effectiveAttack: number,
  enemyDefense: number,
  enemyResistance: number,
  model: GoldenglowExplosionModel,
): GoldenglowExplosionDamageResult {
  const normalizedAttack = finiteNonNegative(effectiveAttack)
  const rawExplosionDamage = normalizedAttack * finiteNonNegative(model.attackScale)
  const breakdown = calculateDamageBreakdown(
    rawExplosionDamage,
    GOLDENGLOW_EXPLOSION_DAMAGE_TYPE,
    finiteNonNegative(enemyDefense),
    finiteNonNegative(enemyResistance),
    { resistanceIgnoreFixed: finiteNonNegative(model.resistanceIgnoreFixed) },
  )

  return {
    model,
    effectiveAttack: normalizedAttack,
    rawExplosionDamage,
    damageAfterMitigation: breakdown.result,
    breakdown,
  }
}

export function calculateGoldenglowExplosion(
  input: GoldenglowExplosionCalculationInput,
): GoldenglowExplosionDamageResult | null {
  const model = deriveGoldenglowExplosionModel(
    input.operatorId,
    input.passives,
    input.skillLevel,
  )
  if (!model) return null

  return calculateGoldenglowExplosionDamage(
    input.effectiveAttack,
    input.enemyDefense ?? 0,
    input.enemyResistance ?? 0,
    model,
  )
}

/**
 * Calculates explosion-inclusive skill DPS without random sampling.
 * S1/S3 use a finite probability-vector calculation. S2 uses the long-run
 * renewal value because the skill is permanent.
 */
export function calculateGoldenglowExpectedDps(
  input: GoldenglowExpectedDpsCalculationInput,
): GoldenglowExpectedDpsResult | null {
  const model = deriveGoldenglowExplosionModel(
    input.operatorId,
    input.passives,
    input.skillLevel,
  )
  if (!model) return null

  return calculateGoldenglowExpectedDpsFromModel({
    model,
    skillIndex: input.skillIndex,
    effectiveAttack: input.effectiveAttack,
    attackInterval: input.attackInterval,
    duration: input.duration,
    enemyDefense: input.enemyDefense,
    enemyResistance: input.enemyResistance,
  })
}

export function calculateGoldenglowExpectedDpsFromModel(
  input: GoldenglowExpectedDpsFromModelInput,
): GoldenglowExpectedDpsResult | null {
  const skillIndex = Math.floor(input.skillIndex)
  if (![1, 2, 3].includes(skillIndex)) return null

  const attackInterval = finiteNonNegative(input.attackInterval)
  if (attackInterval <= 0) return null

  const mode: GoldenglowExpectedDpsMode = skillIndex === 2
    ? 'STEADY_STATE'
    : 'FINITE_WINDOW'
  const duration = finiteNonNegative(input.duration)
  if (mode === 'FINITE_WINDOW' && duration <= 0) return null

  const model = input.model
  const effectiveAttack = finiteNonNegative(input.effectiveAttack)
  const enemyDefense = finiteNonNegative(input.enemyDefense ?? 0)
  const enemyResistance = finiteNonNegative(input.enemyResistance ?? 0)
  const explosionDamage = calculateGoldenglowExplosionDamage(
    effectiveAttack,
    enemyDefense,
    enemyResistance,
    model,
  ).damageAfterMitigation
  const bodyDamagePerAttack = calculateDamageBreakdown(
    effectiveAttack,
    GOLDENGLOW_EXPLOSION_DAMAGE_TYPE,
    enemyDefense,
    enemyResistance,
    { resistanceIgnoreFixed: finiteNonNegative(model.resistanceIgnoreFixed) },
  ).result
  const normalDamageByMisses = createNormalDroneDamageByMisses(
    effectiveAttack,
    enemyDefense,
    enemyResistance,
    model,
  )
  const renewal = calculateRenewalCycle(model, normalDamageByMisses, explosionDamage)
  const cycleSeconds = renewal.expectedAttacks * attackInterval
  const perDroneSteadyNormalDps = safeDivide(renewal.expectedNormalDamage, cycleSeconds)
  const perDroneSteadyExplosionDps = safeDivide(renewal.expectedExplosionDamage, cycleSeconds)
  const meanAttacksPerExplosion = safeDivide(
    renewal.expectedAttacks,
    renewal.expectedExplosionCount,
  )
  const effectiveExplosionRatePercent = safeDivide(
    renewal.expectedExplosionCount,
    renewal.expectedAttacks,
  ) * 100
  const bodyActive = skillIndex !== 3

  if (mode === 'STEADY_STATE') {
    const perDrone = createExpectedDamageComponent({
      expectedNormalDamage: null,
      expectedExplosionDamage: null,
      normalDps: perDroneSteadyNormalDps,
      explosionDps: perDroneSteadyExplosionDps,
      expectedExplosionCount: null,
    })
    const allDrones = scaleExpectedDamageComponent(perDrone, model.activeDroneCount)
    const bodyDps = bodyActive ? bodyDamagePerAttack / attackInterval : 0

    return {
      model,
      mode,
      attackInterval,
      duration: null,
      theoreticalAttackCount: null,
      fullAttackCount: null,
      fractionalAttackWeight: null,
      meanAttacksPerExplosion,
      effectiveExplosionRatePercent,
      expectedExplosionsPerSecondPerDrone: safeDivide(
        renewal.expectedExplosionCount,
        cycleSeconds,
      ),
      body: {
        active: bodyActive,
        damagePerAttack: bodyDamagePerAttack,
        expectedTotalDamage: null,
        dps: bodyDps,
      },
      perDrone,
      allDrones,
      combinedExpectedTotalDamage: null,
      expectedDps: bodyDps + allDrones.dps,
    }
  }

  const attackWindow = splitAttackOpportunities(duration / attackInterval)
  const finite = calculateFiniteDroneWindow(
    model,
    normalDamageByMisses,
    explosionDamage,
    attackWindow.fullAttackCount,
    attackWindow.fractionalAttackWeight,
  )
  const perDrone = createExpectedDamageComponent({
    expectedNormalDamage: finite.expectedNormalDamage,
    expectedExplosionDamage: finite.expectedExplosionDamage,
    normalDps: finite.expectedNormalDamage / duration,
    explosionDps: finite.expectedExplosionDamage / duration,
    expectedExplosionCount: finite.expectedExplosionCount,
  })
  const allDrones = scaleExpectedDamageComponent(perDrone, model.activeDroneCount)
  const bodyExpectedTotalDamage = bodyActive
    ? bodyDamagePerAttack * attackWindow.theoreticalAttackCount
    : 0
  const bodyDps = bodyExpectedTotalDamage / duration
  const combinedExpectedTotalDamage = bodyExpectedTotalDamage
    + (allDrones.expectedTotalDamage ?? 0)

  return {
    model,
    mode,
    attackInterval,
    duration,
    theoreticalAttackCount: attackWindow.theoreticalAttackCount,
    fullAttackCount: attackWindow.fullAttackCount,
    fractionalAttackWeight: attackWindow.fractionalAttackWeight,
    meanAttacksPerExplosion,
    effectiveExplosionRatePercent,
    expectedExplosionsPerSecondPerDrone: safeDivide(
      finite.expectedExplosionCount,
      duration,
    ),
    body: {
      active: bodyActive,
      damagePerAttack: bodyDamagePerAttack,
      expectedTotalDamage: bodyExpectedTotalDamage,
      dps: bodyDps,
    },
    perDrone,
    allDrones,
    combinedExpectedTotalDamage,
    expectedDps: combinedExpectedTotalDamage / duration,
  }
}

/** Returns the PRD chance for the next drone attack after consecutive misses. */
export function getGoldenglowNextExplosionChancePercent(
  consecutiveMisses: number,
  model: Pick<GoldenglowExplosionModel, 'prdStep' | 'prdMaxStack'>,
): number {
  const misses = Number.isFinite(consecutiveMisses)
    ? Math.max(0, Math.floor(consecutiveMisses))
    : 0
  const maximumStack = Math.max(1, Math.floor(model.prdMaxStack))
  if (misses >= maximumStack) return 100
  const stack = Math.min(misses + 1, maximumStack)
  return Math.min(1, finiteNonNegative(model.prdStep) * stack) * 100
}

export function getGoldenglowDroneAttackScalePercent(
  attackCount: number,
  model: Pick<GoldenglowExplosionModel,
    | 'droneInitialAttackScale'
    | 'droneAttackScaleStep'
    | 'droneMaxAttackScale'
    | 'droneMaxStack'
  >,
): number {
  const normalizedAttackCount = Number.isFinite(attackCount)
    ? Math.max(1, Math.floor(attackCount))
    : 1
  const maximumStack = Math.max(0, Math.floor(model.droneMaxStack))
  const stack = Math.min(normalizedAttackCount - 1, maximumStack)
  const scale = Math.min(
    finiteNonNegative(model.droneMaxAttackScale),
    finiteNonNegative(model.droneInitialAttackScale)
      + finiteNonNegative(model.droneAttackScaleStep) * stack,
  )
  return scale * 100
}

interface GoldenglowRenewalCycle {
  expectedAttacks: number
  expectedNormalDamage: number
  expectedExplosionDamage: number
  expectedExplosionCount: number
}

interface GoldenglowFiniteDroneWindow {
  expectedNormalDamage: number
  expectedExplosionDamage: number
  expectedExplosionCount: number
}

function calculateRenewalCycle(
  model: GoldenglowExplosionModel,
  normalDamageByMisses: number[],
  explosionDamage: number,
): GoldenglowRenewalCycle {
  const maximumMisses = Math.max(1, Math.floor(model.prdMaxStack))
  let survivalProbability = 1
  let expectedAttacks = 0
  let expectedNormalDamage = 0
  let expectedExplosionDamage = 0
  let expectedExplosionCount = 0

  for (let misses = 0; misses <= maximumMisses; misses += 1) {
    const explosionProbability = getGoldenglowNextExplosionChancePercent(misses, model) / 100
    const explosionMass = survivalProbability * explosionProbability
    const normalMass = survivalProbability * (1 - explosionProbability)
    expectedAttacks += survivalProbability
    expectedNormalDamage += normalMass * normalDamageByMisses[misses]
    expectedExplosionDamage += explosionMass * explosionDamage
    expectedExplosionCount += explosionMass
    survivalProbability = normalMass
  }

  return {
    expectedAttacks,
    expectedNormalDamage,
    expectedExplosionDamage,
    expectedExplosionCount,
  }
}

function calculateFiniteDroneWindow(
  model: GoldenglowExplosionModel,
  normalDamageByMisses: number[],
  explosionDamage: number,
  fullAttackCount: number,
  fractionalAttackWeight: number,
): GoldenglowFiniteDroneWindow {
  const maximumMisses = Math.max(1, Math.floor(model.prdMaxStack))
  let states: number[] = Array.from({ length: maximumMisses + 1 }, (_, index) => (
    index === 0 ? 1 : 0
  ))
  let expectedNormalDamage = 0
  let expectedExplosionDamage = 0
  let expectedExplosionCount = 0

  const readStep = () => {
    let stepNormalDamage = 0
    let stepExplosionDamage = 0
    let stepExplosionCount = 0
    const nextStates = Array.from({ length: maximumMisses + 1 }, () => 0)

    for (let misses = 0; misses <= maximumMisses; misses += 1) {
      const stateProbability = states[misses]
      if (stateProbability <= 0) continue
      const explosionProbability = getGoldenglowNextExplosionChancePercent(misses, model) / 100
      const explosionMass = stateProbability * explosionProbability
      const normalMass = stateProbability * (1 - explosionProbability)
      stepNormalDamage += normalMass * normalDamageByMisses[misses]
      stepExplosionDamage += explosionMass * explosionDamage
      stepExplosionCount += explosionMass
      nextStates[0] += explosionMass
      if (normalMass > 0) {
        nextStates[Math.min(misses + 1, maximumMisses)] += normalMass
      }
    }

    return {
      stepNormalDamage,
      stepExplosionDamage,
      stepExplosionCount,
      nextStates,
    }
  }

  for (let attack = 0; attack < fullAttackCount; attack += 1) {
    const step = readStep()
    expectedNormalDamage += step.stepNormalDamage
    expectedExplosionDamage += step.stepExplosionDamage
    expectedExplosionCount += step.stepExplosionCount
    states = step.nextStates
  }

  if (fractionalAttackWeight > 0) {
    const step = readStep()
    expectedNormalDamage += step.stepNormalDamage * fractionalAttackWeight
    expectedExplosionDamage += step.stepExplosionDamage * fractionalAttackWeight
    expectedExplosionCount += step.stepExplosionCount * fractionalAttackWeight
  }

  return {
    expectedNormalDamage,
    expectedExplosionDamage,
    expectedExplosionCount,
  }
}

function createNormalDroneDamageByMisses(
  effectiveAttack: number,
  enemyDefense: number,
  enemyResistance: number,
  model: GoldenglowExplosionModel,
): number[] {
  const maximumMisses = Math.max(1, Math.floor(model.prdMaxStack))
  return Array.from({ length: maximumMisses + 1 }, (_, misses) => {
    const attackScale = getGoldenglowDroneAttackScalePercent(misses + 1, model) / 100
    return calculateDamageBreakdown(
      effectiveAttack * attackScale,
      GOLDENGLOW_EXPLOSION_DAMAGE_TYPE,
      enemyDefense,
      enemyResistance,
      { resistanceIgnoreFixed: finiteNonNegative(model.resistanceIgnoreFixed) },
    ).result
  })
}

function createExpectedDamageComponent({
  expectedNormalDamage,
  expectedExplosionDamage,
  normalDps,
  explosionDps,
  expectedExplosionCount,
}: {
  expectedNormalDamage: number | null
  expectedExplosionDamage: number | null
  normalDps: number
  explosionDps: number
  expectedExplosionCount: number | null
}): GoldenglowExpectedDamageComponent {
  return {
    expectedNormalDamage,
    expectedExplosionDamage,
    expectedTotalDamage: expectedNormalDamage === null || expectedExplosionDamage === null
      ? null
      : expectedNormalDamage + expectedExplosionDamage,
    normalDps,
    explosionDps,
    dps: normalDps + explosionDps,
    expectedExplosionCount,
  }
}

function scaleExpectedDamageComponent(
  component: GoldenglowExpectedDamageComponent,
  count: number,
): GoldenglowExpectedDamageComponent {
  const normalizedCount = Math.max(0, Math.floor(count))
  return {
    expectedNormalDamage: scaleNullable(component.expectedNormalDamage, normalizedCount),
    expectedExplosionDamage: scaleNullable(component.expectedExplosionDamage, normalizedCount),
    expectedTotalDamage: scaleNullable(component.expectedTotalDamage, normalizedCount),
    normalDps: component.normalDps * normalizedCount,
    explosionDps: component.explosionDps * normalizedCount,
    dps: component.dps * normalizedCount,
    expectedExplosionCount: scaleNullable(component.expectedExplosionCount, normalizedCount),
  }
}

function splitAttackOpportunities(value: number): {
  theoreticalAttackCount: number
  fullAttackCount: number
  fractionalAttackWeight: number
} {
  const normalized = finiteNonNegative(value)
  const nearestInteger = Math.round(normalized)
  const tolerance = Number.EPSILON * Math.max(1, normalized) * 32
  const stableValue = Math.abs(normalized - nearestInteger) <= tolerance
    ? nearestInteger
    : normalized
  const fullAttackCount = Math.floor(stableValue)
  return {
    theoreticalAttackCount: stableValue,
    fullAttackCount,
    fractionalAttackWeight: stableValue - fullAttackCount,
  }
}

function readDroneRamp(passives: OperatorPassives): {
  initialScale: number
  scaleStep: number
  maximumScale: number
  maximumStack: number
} {
  const trait = passives.sources.find((source) => source.sourceKind === 'TRAIT')
  const initialScale = readNonNegativeBlackboardValue(
    trait,
    'init_atk_scale',
  ) ?? DEFAULT_DRONE_INITIAL_ATTACK_SCALE
  const scaleStep = readNonNegativeBlackboardValue(
    trait,
    'delta_atk_scale',
  ) ?? DEFAULT_DRONE_ATTACK_SCALE_STEP
  const maximumScale = readNonNegativeBlackboardValue(
    trait,
    'max_atk_scale',
  ) ?? DEFAULT_DRONE_MAX_ATTACK_SCALE
  const maximumStackValue = readNonNegativeBlackboardValue(
    trait,
    'max_stack_cnt',
  ) ?? DEFAULT_DRONE_MAX_STACK

  return {
    initialScale,
    scaleStep,
    maximumScale: Math.max(initialScale, maximumScale),
    maximumStack: Math.max(0, Math.round(maximumStackValue)),
  }
}

function findTalentSource(
  passives: OperatorPassives,
  talentIndex: number,
): PassiveSource | null {
  return passives.sources.find((source) => (
    source.sourceKind === 'TALENT' && source.talentIndex === talentIndex
  )) ?? null
}

function readPositiveBlackboardValue(
  source: PassiveSource,
  key: string,
): number | null {
  const value = source.blackboard.find((entry) => normalizeKey(entry.key) === key)?.value
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
}

function readNonNegativeBlackboardValue(
  source: PassiveSource | undefined,
  key: string,
): number | null {
  if (!source) return null
  const value = source.blackboard.find((entry) => normalizeKey(entry.key) === key)?.value
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null
}

function readResistanceIgnore(passives: OperatorPassives): number {
  const source = findTalentSource(passives, RESISTANCE_IGNORE_TALENT_INDEX)
  if (!source) return 0
  return readPositiveBlackboardValue(source, 'magic_resist_penetrate_fixed') ?? 0
}

function readNonNegativeSkillCount(level: RawSkillLevel, key: string): number {
  const value = level.blackboard?.find((entry) => normalizeKey(entry.key) === key)?.value
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0
}

function readNominalChancePercent(description: string): number | null {
  const match = description.normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*%\s*の確率/)
  const value = Number(match?.[1])
  return Number.isFinite(value) && value >= 0 ? value : null
}

function normalizeKey(key: string | undefined): string {
  return key?.trim().toLowerCase() ?? ''
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function scaleNullable(value: number | null, scale: number): number | null {
  return value === null ? null : value * scale
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

function toPercent(value: number): number {
  return Math.round(finiteNonNegative(value) * 100 * 1e9) / 1e9
}

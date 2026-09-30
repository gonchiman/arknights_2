import type { RawAttributeKeyFrame, RawBlackboardCollection, SkillRecord } from '../types/skill.ts'
import {
  applyOperatorModule,
  getOperatorModuleId,
  getOperatorModuleLevels,
  getOperatorModulePhase,
  getOperatorModules,
  isOperatorModuleUnlocked,
} from './operatorModules.ts'
import { getOperatorPassives } from './operatorProfile.ts'
import { getOperatorPotentialApplication } from './operatorPotentials.ts'
import { getSkillLevelLabel } from './skillJsonAnalysis.ts'

export interface SurtrDurationSettings {
  level: number
  trust: number
  potential: number
  skillLevelIndex: number
}

export interface SurtrDurationModel {
  moduleId: string
  moduleType: 'X' | 'Y' | null
  moduleLevel: number
  skillName: string
  skillLevelIndex: number
  skillLevelLabel: string
  baseMaxHp: number
  skillHpBonus: number
  maxHp: number
  activationDelay: number
  drainInterval: number
  rampDuration: number
  /** Fraction of maximum HP removed per second once the ramp reaches its cap. */
  maxDrainRate: number
  remnantDuration: number
  calculationKind: 'tick-estimate'
}

export interface SurtrDurationPoint {
  /** Seconds since the player activates S3, including its startup animation. */
  time: number
  hp: number
  maxHp: number
  /** Percentage of the maximum HP at this point, not of the pre-skill HP. */
  hpPercent: number
  phase: 'activation' | 'drain' | 'remnant'
}

export interface SurtrDurationDrainTick {
  time: number
  rate: number
  /** Requested HP removal before Remnant's one-HP floor. No integer rounding. */
  hpLoss: number
  hpAfter: number
}

export interface SurtrDurationResult {
  remnantStart: number
  remnantDuration: number
  retreatTime: number
  points: SurtrDurationPoint[]
  drainSchedule: SurtrDurationDrainTick[]
}

// Sources checked 2026-09-30:
// https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/jp/gamedata/excel/skill_table.json
// skchr_surtr_3: max_hp=5000, interval=0.2, hp_ratio=0.2, duration=60, all skill ranks.
// character_table.json: char_350_surtr E2 HP=2216..2916; E2 Remnant=8s (potential 3+: 9s).
// battle_equip_table.json: X/Y add no HP; Y level 3 extends Remnant by one second.
// https://prts.wiki/w/%E5%8F%B2%E5%B0%94%E7%89%B9%E5%B0%94 (S3 notes):
// startup=0.6s, then full heal; HP removal is linear from zero, applied every 0.2s.
// Startup delay is not in the skill blackboard. This is an explicit estimated
// timing convention: first tick one interval after startup, rate sampled at that
// tick's elapsed time, no HP integer rounding or engine-frame quantization.
export const SURTR_S3_ACTIVATION_DELAY = 0.6

/** E2 S3, full HP before activation, no external healing, damage, or HP buffs. */
export function deriveSurtrDurationModel(
  record: SkillRecord,
  settings: SurtrDurationSettings,
  moduleId = '',
  moduleLevel = 3,
): SurtrDurationModel | null {
  if (record.operatorId !== 'char_350_surtr' || record.skillIndex !== 3) return null
  const profile = record.operatorProfile
  const phase = profile.phases[2]
  if (!positive(phase?.maxLevel) || !Number.isInteger(settings.level)
    || settings.level < 1 || settings.level > phase.maxLevel
    || !nonNegative(settings.trust) || settings.trust > 100
    || !Number.isInteger(settings.potential) || settings.potential < 1
    || !Number.isInteger(settings.skillLevelIndex) || settings.skillLevelIndex < 0) return null
  const skill = record.skillLevels[settings.skillLevelIndex]
  if (!skill) return null
  const skillHpBonus = readValue(skill.blackboard, 'max_hp')
  const drainInterval = readValue(skill.blackboard, 'interval')
  const maxDrainRate = readValue(skill.blackboard, 'hp_ratio')
  const rampDuration = readValue(skill.blackboard, 'duration')
  if (!nonNegative(skillHpBonus) || !positive(drainInterval)
    || !positive(maxDrainRate) || !positive(rampDuration)) return null

  const potential = getOperatorPotentialApplication(profile, settings.potential)
  if (potential.potentialRank !== settings.potential || potential.unsupportedReasons.length) return null
  const hpEffects = potential.effects.filter((effect) => effect.attributeType === 'MAX_HP')
  if (hpEffects.some((effect) => effect.formulaItem !== 'ADDITION' || !nonNegative(effect.value))) return null
  const potentialHp = hpEffects.reduce((sum, effect) => sum + (effect.value ?? 0), 0)
  const module = moduleId ? getOperatorModules(profile).find((candidate, index) => (
    getOperatorModuleId(candidate, index) === moduleId
  )) : undefined
  if (moduleId && (!module || !Number.isInteger(moduleLevel)
    || !getOperatorModuleLevels(module).includes(moduleLevel)
    || !isOperatorModuleUnlocked(module, 2, settings.level))) return null
  const moduleType = module?.typeName2?.trim() ?? null
  if ((module && moduleType === null) || (moduleType !== null && moduleType !== 'X' && moduleType !== 'Y')) return null
  const modulePhase = getOperatorModulePhase(module, moduleLevel)
  if (module && !modulePhase?.attributeBlackboard) return null
  const moduleHp = readValue(modulePhase?.attributeBlackboard, 'max_hp') ?? 0
  if (!nonNegative(moduleHp)) return null
  const application = applyOperatorModule(
    getOperatorPassives(profile, 2, settings.level, settings.potential),
    module,
    moduleLevel,
    settings.potential,
  )
  if (application.unsupportedReasons.length) return null
  const remnantDuration = readValue(application.passives.sources.find((source) => (
    source.sourceKind === 'TALENT' && source.talentIndex === 1
  ))?.blackboard, 'surtr_t_2[withdraw].interval')
  if (!positive(remnantDuration)) return null
  const phaseHp = interpolateHp(phase.attributesKeyFrames, settings.level)
  const trustFrameLevel = Math.max(0, ...profile.favorKeyFrames.map((frame) => frame.level ?? 0))
    * settings.trust / 100
  const trustHp = interpolateHp(profile.favorKeyFrames, trustFrameLevel)
  if (!positive(phaseHp) || !nonNegative(trustHp)) return null
  const baseMaxHp = Math.round(phaseHp + trustHp + potentialHp + moduleHp)
  const maxHp = baseMaxHp + skillHpBonus
  if (!positive(baseMaxHp) || maxHp <= 1) return null
  return {
    moduleId,
    moduleType,
    moduleLevel: module ? application.moduleLevel : 0,
    skillName: skill.name ?? record.skillName,
    skillLevelIndex: settings.skillLevelIndex,
    skillLevelLabel: getSkillLevelLabel(settings.skillLevelIndex, record.skillLevels.length),
    baseMaxHp,
    skillHpBonus,
    maxHp,
    activationDelay: SURTR_S3_ACTIVATION_DELAY,
    drainInterval,
    rampDuration,
    maxDrainRate,
    remnantDuration,
    calculationKind: 'tick-estimate',
  }
}

/**
 * Discrete estimate, not a frame-accurate reproduction of native game code.
 * Tick n removes maxHP * interval * maxRate * min(n * interval / ramp, 1).
 * The first lethal tick triggers Remnant; its expiry is retreat, not HP damage.
 */
export function calculateSurtrDuration(model: SurtrDurationModel): SurtrDurationResult | null {
  if (!positive(model.baseMaxHp) || !positive(model.maxHp) || model.maxHp <= 1
    || !nonNegative(model.activationDelay) || !positive(model.drainInterval)
    || !positive(model.rampDuration) || !positive(model.maxDrainRate)
    || !positive(model.remnantDuration)) return null
  const points: SurtrDurationPoint[] = [point(0, model.baseMaxHp, model.baseMaxHp, 'activation')]
  // The skill increases maximum HP and heals to that new maximum.
  points.push(point(model.activationDelay, model.maxHp, model.maxHp, 'drain'))
  const drainSchedule: SurtrDurationDrainTick[] = []
  let hp = model.maxHp
  // Bound malformed future data; normal Surtr needs only 122 iterations.
  const maximumTicks = Math.ceil((model.rampDuration + 1 / model.maxDrainRate) / model.drainInterval) + 1
  if (!Number.isSafeInteger(maximumTicks) || maximumTicks > 100_000) return null
  for (let tick = 1; tick <= maximumTicks; tick += 1) {
    const elapsed = tick * model.drainInterval
    const time = cleanTime(model.activationDelay + elapsed)
    const rate = model.maxDrainRate * Math.min(elapsed / model.rampDuration, 1)
    const hpLoss = model.maxHp * model.drainInterval * rate
    const lethal = hp - hpLoss <= 0
    hp = lethal ? 1 : hp - hpLoss
    drainSchedule.push({ time, rate, hpLoss, hpAfter: hp })
    points.push(point(time, hp, model.maxHp, lethal ? 'remnant' : 'drain'))
    if (lethal) {
      const retreatTime = cleanTime(time + model.remnantDuration)
      points.push(point(retreatTime, 1, model.maxHp, 'remnant'))
      return { remnantStart: time, remnantDuration: model.remnantDuration, retreatTime, points, drainSchedule }
    }
  }
  return null
}

function point(time: number, hp: number, maxHp: number, phase: SurtrDurationPoint['phase']): SurtrDurationPoint {
  return { time, hp, maxHp, hpPercent: hp / maxHp * 100, phase }
}

function interpolateHp(frames: RawAttributeKeyFrame[] | undefined, level: number): number | null {
  if (!frames?.length || frames.some((frame) => !nonNegative(frame.level) || !nonNegative(frame.data?.maxHp))) return null
  const ordered = [...frames].sort((a, b) => a.level! - b.level!)
  const first = ordered[0]
  const last = ordered.at(-1)!
  if (level <= first.level!) return first.data!.maxHp!
  if (level >= last.level!) return last.data!.maxHp!
  const upperIndex = ordered.findIndex((frame) => frame.level! >= level)
  const upper = ordered[upperIndex]
  const lower = ordered[upperIndex - 1]
  const ratio = (level - lower.level!) / (upper.level! - lower.level!)
  return lower.data!.maxHp! + (upper.data!.maxHp! - lower.data!.maxHp!) * ratio
}

function readValue(entries: RawBlackboardCollection | undefined, key: string): number | undefined {
  if (!entries) return undefined
  const value = Array.isArray(entries)
    ? entries.find((entry) => entry.key?.toLowerCase() === key)?.value
    : entries[key]
  return typeof value === 'number' ? value : undefined
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function cleanTime(value: number): number {
  return Math.round(value * 1e9) / 1e9
}

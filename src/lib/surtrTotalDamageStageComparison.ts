import type { SkillRecord } from '../types/skill.ts'
import { calculateSurtrDps, deriveSurtrDpsModel, type SurtrDpsSettings } from './surtrDps.ts'
import { getModuleComparisonColors } from './moduleColors.ts'
import { getSurtrModuleChoices } from './surtrModuleComparison.ts'
import { deriveSurtrRemnantAttackModel } from './surtrRemnantAttacks.ts'
import { calculateSurtrRemnantExpectedDamage } from './surtrRemnantExpectation.ts'
import {
  calculateSurtrTotalDamage,
  deriveSurtrTotalDamageModel,
  type SurtrTotalDamageAssumptions,
  type SurtrTotalDamageResult,
} from './surtrTotalDamage.ts'

interface SurtrStageBarMetadata {
  id: string
  moduleId: string
  label: string
  moduleType: 'X' | 'Y' | null
  moduleLevel: number
  color: string
}

export interface SurtrTotalDamageStageBar extends SurtrStageBarMetadata {
  /** Available models retain their delay limit even when the calculation is invalid. */
  hitDelayLimit: number | null
  /** Missing/locked stages or invalid calculation inputs have no numeric bar. */
  result: SurtrTotalDamageResult | null
}

interface SurtrStageGroup<Bar> {
  id: string
  label: string
  moduleLevel: number
  /** Unequipped has one bar; each equipped stage has stable X and Y slots. */
  bars: Bar[]
}

export interface SurtrTotalDamageStageGroup extends SurtrStageGroup<SurtrTotalDamageStageBar> {}

export type SurtrStageMetric = 'before-dps' | 'remnant-expected-damage'

export interface SurtrStageMetricBar extends SurtrStageBarMetadata {
  /** DPS has no hit-delay constraint; expected damage retains available model limits. */
  hitDelayLimit: number | null
  /** Missing/locked stages or invalid calculation inputs remain null, not zero. */
  value: number | null
}

export interface SurtrStageMetricGroup extends SurtrStageGroup<SurtrStageMetricBar> {}

export interface SurtrStageResistanceGroup extends Omit<SurtrStageMetricGroup, 'bars'> {
  /** Input resistance order and duplicates are preserved inside every stage. */
  resistanceGroups: { resistance: number; bars: SurtrStageMetricBar[] }[]
}

/**
 * Compare every available module stage at one time/RES coordinate, independently
 * of the table's stage selection. Keep null slots instead of implying zero damage
 * for absent data, and retain the exact existing before/Remnant hit calculation.
 */
export function buildSurtrTotalDamageStageComparison(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  activationTime: number,
  resistance: number,
  assumptions: SurtrTotalDamageAssumptions,
): SurtrTotalDamageStageGroup[] {
  return buildStageGroups(record, settings, (moduleId, moduleLevel, available) => {
    const model = available ? deriveSurtrTotalDamageModel(record, settings, moduleId, moduleLevel) : null
    return {
      hitDelayLimit: model ? Math.min(model.timing.attackIntervalBefore, model.timing.attackIntervalAfter) : null,
      result: model
        ? calculateSurtrTotalDamage(model, activationTime, resistance, assumptions, { includeAttacks: false })
        : null,
    }
  })
}

/**
 * Compare sustained pre-activation DPS or Remnant damage averaged over each
 * stage's full uniform CT range. Neither metric uses an activation or first
 * attack time; only expected damage uses the hit delay and CT carry assumptions.
 */
export function buildSurtrStageMetricComparison(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  resistance: number,
  assumptions: SurtrTotalDamageAssumptions,
  metric: SurtrStageMetric,
): SurtrStageMetricGroup[] {
  const beforeSettings = { ...settings, remnantActive: false }
  return buildStageGroups(record, settings, (moduleId, moduleLevel, available) => {
    const before = available ? deriveSurtrDpsModel(record, beforeSettings, moduleId, moduleLevel) : null
    if (metric === 'before-dps') {
      return { hitDelayLimit: null, value: before ? calculateSurtrDps(before, resistance) : null }
    }
    const attacks = before ? deriveSurtrRemnantAttackModel(record, beforeSettings, moduleId, moduleLevel) : null
    return {
      hitDelayLimit: attacks?.attackIntervalAfter ?? null,
      value: before && attacks ? calculateSurtrRemnantExpectedDamage(before, attacks, resistance, {
        windup: assumptions.hitDelay,
        ctCarry: assumptions.ctCarry,
        includeRetreatHit: assumptions.includeRetreatHit,
      })?.totalDamage ?? null : null,
    }
  })
}

/**
 * Arrange the existing single-resistance comparisons by stage, then resistance.
 * Repeated resistances share calculation work, but never mutable output bars.
 * Empty input retains the four stages with no resistance groups.
 */
export function buildSurtrStageResistanceComparison(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  resistances: readonly number[],
  assumptions: SurtrTotalDamageAssumptions,
  metric: SurtrStageMetric | 'total-damage',
  activationTime = 25,
): SurtrStageResistanceGroup[] {
  const groups: SurtrStageResistanceGroup[] = buildStageGroups(record, settings, () => ({}))
    .map(({ id, label, moduleLevel }) => ({ id, label, moduleLevel, resistanceGroups: [] }))
  const calculated = new Map<number, SurtrStageMetricGroup[]>()
  for (const resistance of resistances) {
    let comparison = calculated.get(resistance)
    if (!comparison) {
      comparison = metric === 'total-damage'
        ? buildSurtrTotalDamageStageComparison(record, settings, activationTime, resistance, assumptions)
          .map(group => ({ ...group, bars: group.bars.map(({ result, ...bar }) => ({
            ...bar, value: result?.totalDamage ?? null,
          })) }))
        : buildSurtrStageMetricComparison(record, settings, resistance, assumptions, metric)
      calculated.set(resistance, comparison)
    }
    comparison.forEach((group, index) => {
      groups[index].resistanceGroups.push({ resistance, bars: group.bars.map(bar => ({ ...bar })) })
    })
  }
  return groups
}

/** One stage inventory and palette for all metrics, including missing-stage slots. */
function buildStageGroups<Calculation>(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  calculate: (moduleId: string, moduleLevel: number, available: boolean) => Calculation,
): SurtrStageGroup<SurtrStageBarMetadata & Calculation>[] {
  const choices = getSurtrModuleChoices(record.operatorProfile, settings.level)
  const groups = [0, 1, 2, 3].map(moduleLevel => {
    const types: ('X' | 'Y' | null)[] = moduleLevel === 0 ? [null] : ['X', 'Y']
    return {
      id: moduleLevel === 0 ? 'none' : `lv${moduleLevel}`,
      label: moduleLevel === 0 ? '未装備' : `Lv.${moduleLevel}`,
      moduleLevel,
      bars: types.map(moduleType => {
        const choice = choices.find(candidate => candidate.type === moduleType)
        const available = choice?.unlocked && (moduleType === null || choice.levels.includes(moduleLevel))
        return {
          id: moduleType === null ? 'none' : `${choice?.id ?? `missing-${moduleType}`}:lv${moduleLevel}`,
          moduleId: choice?.id ?? '',
          label: moduleType === null ? '未装備' : `MOD ${moduleType} Lv.${moduleLevel}`,
          moduleType,
          moduleLevel,
          color: '',
          ...calculate(choice?.id ?? '', moduleLevel, !!available),
        }
      }),
    }
  })
  const bars = groups.flatMap(group => group.bars)
  // The category labels identify stages; color identifies only the module type.
  const colors = getModuleComparisonColors(bars)
  bars.forEach((bar, index) => { bar.color = colors[index] })
  return groups
}

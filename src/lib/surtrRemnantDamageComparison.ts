import type { SkillRecord } from '../types/skill.ts'
import { MODULE_BASE_COLORS } from './moduleColors.ts'
import { deriveSurtrDpsModel, type SurtrDpsSettings } from './surtrDps.ts'
import type { SurtrDpsLineStyle, SurtrDpsOutputSeries } from './surtrDpsOutput.ts'
import { deriveSurtrRemnantAttackModel, type SurtrRemnantAttackAssumptions } from './surtrRemnantAttacks.ts'
import { buildSurtrRemnantExpectedDamagePoints, calculateSurtrRemnantAttackExpectation } from './surtrRemnantExpectation.ts'
import { getSurtrPreviousStageId, type SurtrUnequippedBlockingComparison, type SurtrUnequippedComparisonBase } from './surtrUnequippedComparison.ts'

export interface SurtrRemnantDamageComparisonStage {
  id: string
  moduleId: string
  level: number
  label: string
  color: string
  lineStyle?: SurtrDpsLineStyle
}

export interface SurtrRemnantDamageComparison {
  series: SurtrDpsOutputSeries[]
  baseline: SurtrDpsOutputSeries
  blockingComparison: SurtrUnequippedBlockingComparison[]
}

/**
 * Raw single-target expected total damage, using each model's entire uniform CT
 * range. Hidden baselines remain separate from the selected module stages;
 * difference, ratio and growth calculations are left to the shared comparison.
 */
export function buildSurtrRemnantDamageComparison(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  selectedStages: readonly SurtrRemnantDamageComparisonStage[],
  assumptions: SurtrRemnantAttackAssumptions,
  comparisonBase: SurtrUnequippedComparisonBase,
  resistances: readonly number[],
): SurtrRemnantDamageComparison | null {
  if (!selectedStages.length) return null
  const unequipped = selectedStages.find(stage => stage.id === 'none') ?? {
    id: 'none', moduleId: '', level: 0, label: '未装備', color: MODULE_BASE_COLORS.none,
    lineStyle: 'solid' as const,
  }
  const visible = [unequipped, ...selectedStages.filter(stage => stage.id !== 'none')]
  const modules = new Map(visible.map(stage => [stage.id, stage]))
  if (comparisonBase === 'previous') {
    for (const stage of visible) {
      if (stage.id === 'none') continue
      const previousId = getSurtrPreviousStageId(stage.id)
      if (!previousId) return null
      if (previousId === 'none' || modules.has(previousId)) continue
      modules.set(previousId, {
        ...stage, id: previousId, level: stage.level - 1,
        label: stage.label.replace(/Lv\.\d+$/, `Lv.${stage.level - 1}`),
      })
    }
  }

  const visibleIds = new Set(visible.map(stage => stage.id))
  const blockingComparison: SurtrUnequippedBlockingComparison[] = []
  for (const blocking of [false, true]) {
    const conditionSettings = { ...settings, blocking }
    const referenceSeries: SurtrDpsOutputSeries[] = []
    for (const stage of modules.values()) {
      const dpsModel = deriveSurtrDpsModel(record, conditionSettings, stage.moduleId, stage.level)
      const attackModel = deriveSurtrRemnantAttackModel(record, conditionSettings, stage.moduleId, stage.level)
      if (!dpsModel || !attackModel || !calculateSurtrRemnantAttackExpectation(attackModel, assumptions)) return null
      referenceSeries.push({
        id: stage.id, label: stage.label, color: stage.color,
        ...(stage.lineStyle === undefined ? {} : { lineStyle: stage.lineStyle }),
        points: buildSurtrRemnantExpectedDamagePoints(dpsModel, attackModel, resistances, assumptions)
          .map(({ x, value }) => ({ x, value })),
      })
    }
    const series = referenceSeries.filter(item => visibleIds.has(item.id))
    const baseline = series.find(item => item.id === 'none')!
    blockingComparison.push({ blocking, series, baseline, referenceSeries })
  }
  const selectedCondition = blockingComparison[settings.blocking ? 1 : 0]
  return { series: [...selectedCondition.series], baseline: selectedCondition.baseline, blockingComparison }
}

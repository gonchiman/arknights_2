import type { SkillRecord } from '../types/skill.ts'
import { getModuleComparisonColors } from './moduleColors.ts'
import { buildSurtrDpsCurve, deriveSurtrDpsModel, type SurtrDpsModel, type SurtrDpsSettings } from './surtrDps.ts'
import type { SurtrDpsOutputSeries } from './surtrDpsOutput.ts'
import type { SelectedSurtrModuleStage } from './surtrModuleComparison.ts'
import { getSurtrPreviousStageId, type SurtrUnequippedBlockingComparison, type SurtrUnequippedComparisonBase } from './surtrUnequippedComparison.ts'

export interface SurtrPotentialComparisonEntry extends SelectedSurtrModuleStage {
  moduleStageId: string
  potential: number
  model: SurtrDpsModel
  points: SurtrDpsOutputSeries['points']
}

export interface SurtrPotentialComparison {
  series: SurtrDpsOutputSeries[]
  baseline: SurtrDpsOutputSeries
  referenceSeries: SurtrDpsOutputSeries[]
  blockingComparison: SurtrUnequippedBlockingComparison[]
  entries: SurtrPotentialComparisonEntry[]
}

/** Invalid potentials use potential 1, matching the shared module-color normalization. */
export function normalizeSurtrComparisonPotentials(potentials: readonly number[]): number[] {
  return [...new Set(potentials.map(potential => Number.isInteger(potential) && potential >= 1 && potential <= 6 ? potential : 1))]
}

/** Build each condition and its hidden references from the same selected inputs. */
export function buildSurtrPotentialComparison(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  stages: readonly SelectedSurtrModuleStage[],
  potentials: readonly number[],
  comparisonBase: SurtrUnequippedComparisonBase,
): SurtrPotentialComparison | null {
  const selectedPotentials = normalizeSurtrComparisonPotentials(potentials)
  const selectedStages = [...new Map(stages.map(stage => [stage.id, stage])).values()]
  if (!selectedStages.length || !selectedPotentials.length || typeof settings.blocking !== 'boolean') return null
  const fixedPotential = /^potential-([1-6])$/.exec(comparisonBase)
  if (comparisonBase !== 'unequipped' && comparisonBase !== 'previous' && !fixedPotential) return null

  const unequipped: SelectedSurtrModuleStage = selectedStages.find(stage => stage.id === 'none') ?? {
    moduleId: '', id: 'none', type: null, label: '未装備', level: 0, lineStyle: 'solid', color: '',
  }
  const references = new Map<string, SelectedSurtrModuleStage & { moduleStageId: string; potential: number }>()
  const addReference = (stage: SelectedSurtrModuleStage, potential: number) => {
    const id = `${stage.id}:pot${potential}`
    if (!references.has(id)) references.set(id, {
      ...stage, id, moduleStageId: stage.id, potential, label: `${stage.label} 潜在${potential}`,
    })
  }
  for (const stage of selectedStages) {
    if (stage.id !== (stage.moduleId ? `${stage.moduleId}:lv${stage.level}` : 'none')) return null
    for (const potential of selectedPotentials) addReference(stage, potential)
  }
  for (const potential of selectedPotentials) addReference(unequipped, potential)
  for (const stage of selectedStages) {
    if (comparisonBase === 'previous' && stage.id !== 'none') {
      const previousId = getSurtrPreviousStageId(stage.id)
      if (!previousId) return null
      const previousStage = previousId === 'none' ? unequipped : {
        ...stage, id: previousId, level: stage.level - 1,
        label: stage.label.replace(/Lv\.\d+$/, `Lv.${stage.level - 1}`),
        lineStyle: (stage.level === 2 ? 'dotted' : 'dashed') as SelectedSurtrModuleStage['lineStyle'],
      }
      for (const potential of selectedPotentials) addReference(previousStage, potential)
    }
    if (fixedPotential) addReference(stage, Number(fixedPotential[1]))
  }
  const referenceStages = [...references.values()]
  const colors = getModuleComparisonColors(referenceStages.map(stage => ({
    moduleType: stage.type, moduleLevel: stage.level, potential: stage.potential,
  })), { shadeBy: selectedPotentials.length > 1 ? 'potential' : 'moduleLevel' })
  const visibleIds = new Set(selectedStages.flatMap(stage => selectedPotentials.map(potential => `${stage.id}:pot${potential}`)))
  const blockingComparison: SurtrUnequippedBlockingComparison[] = []
  let selectedEntries: SurtrPotentialComparisonEntry[] = []
  for (const blocking of [false, true]) {
    const entries: SurtrPotentialComparisonEntry[] = []
    for (const [index, stage] of referenceStages.entries()) {
      const model = deriveSurtrDpsModel(record, { ...settings, blocking, potential: stage.potential }, stage.moduleId, stage.level)
      if (!model) return null
      const curve = buildSurtrDpsCurve(model)
      if (curve.length !== 101) return null
      entries.push({ ...stage, color: colors[index], model, points: curve.map(point => ({ x: point.resistance, value: point.dps })) })
    }
    const referenceSeries = entries.map(({ id, moduleStageId, potential, label, color, lineStyle, points }) => ({
      id, moduleStageId, potential, label, color, lineStyle, points,
    }))
    const series = referenceSeries.filter(item => visibleIds.has(item.id))
    const baseline = referenceSeries.find(item => item.moduleStageId === 'none' && item.potential === selectedPotentials[0])
    if (!baseline) return null
    blockingComparison.push({ blocking, series, baseline, referenceSeries })
    if (blocking === settings.blocking) selectedEntries = entries.filter(item => visibleIds.has(item.id))
  }
  const selectedCondition = blockingComparison[settings.blocking ? 1 : 0]
  return {
    series: [...selectedCondition.series], baseline: selectedCondition.baseline,
    referenceSeries: [...selectedCondition.referenceSeries!], blockingComparison, entries: selectedEntries,
  }
}

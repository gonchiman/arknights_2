import type { SurtrDpsOutputSeries } from './surtrDpsOutput.ts'
import { getSurtrPreviousStageId, isSurtrUnequippedSeries, type SurtrUnequippedComparisonBase } from './surtrUnequippedComparison.ts'

export interface SurtrComparisonTableTitleData {
  /** Only displayed series: hidden references must not add comparison dimensions. */
  series: readonly Pick<SurtrDpsOutputSeries, 'id' | 'moduleStageId' | 'potential' | 'label'>[]
  comparisonBase?: SurtrUnequippedComparisonBase
}

/** Describe what the captured S3 table compares, independently of preset names and result values. */
export function getSurtrComparisonTableTitle({ series, comparisonBase = 'unequipped' }: SurtrComparisonTableTitleData): string {
  const targets = series.filter(item => comparisonBase.startsWith('potential-') || !isSurtrUnequippedSeries(item))
  const modules = new Map<string, { name: string; levels: Set<number> }>()
  const potentials = new Set<number>()
  let comparesPreviousStage = false

  for (const item of targets) {
    const stageId = item.moduleStageId ?? item.id.replace(/:pot[1-6]$/, '')
    const potential = item.potential ?? Number(/:pot([1-6])$/.exec(item.id)?.[1])
    if (Number.isInteger(potential) && potential >= 1 && potential <= 6) potentials.add(potential)
    if (isSurtrUnequippedSeries(item)) continue
    const stage = /^(.*):lv([123])$/.exec(stageId)
    const moduleId = stage?.[1] ?? stageId
    if (!modules.has(moduleId)) modules.set(moduleId, {
      name: item.label.replace(/\s*潜在[1-6]\s*$/, '').replace(/\s*Lv\.[123]\s*$/, '').trim(), levels: new Set(),
    })
    if (stage) modules.get(moduleId)!.levels.add(Number(stage[2]))
    const previousStage = getSurtrPreviousStageId(stageId)
    if (comparisonBase === 'previous' && previousStage !== null && previousStage !== 'none') comparesPreviousStage = true
  }

  const fixedPotential = Number(/^potential-([1-6])$/.exec(comparisonBase)?.[1])
  const comparesPotential = potentials.size > 1 || [...potentials].some(potential => Number.isInteger(fixedPotential) && potential !== fixedPotential)
  const comparesStage = comparesPreviousStage || [...modules.values()].some(module => module.levels.size > 1)
  const dimensions = [
    ...(modules.size > 1 ? ['MOD'] : []),
    ...(comparesStage ? ['段階'] : []),
    ...(comparesPotential ? ['潜在'] : []),
  ]
  if (modules.size === 1 && comparesStage) {
    const name = [...modules.values()][0].name
    // The visible MOD name already identifies the sole module; avoid a second generic MOD label.
    return `スルト S3 ${name || 'MOD'} ${dimensions.join('・')}比較`
  }
  return `スルト S3 ${dimensions.length ? dimensions.join('・') : modules.size ? 'MOD' : 'DPS'}比較`
}

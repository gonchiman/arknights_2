import type { SkillRecord } from '../types/skill.ts'
import { buildSurtrDpsCurve, deriveSurtrDpsModel, type SurtrDpsSettings } from './surtrDps.ts'
import { transformSurtrDpsSeries, type SurtrDpsMetric, type SurtrDpsOutputSeries } from './surtrDpsOutput.ts'

export interface SurtrDpsBlockComparisonModule {
  id: string
  label: string
  color: string
  level: number
}

export interface SurtrDpsBlockComparison {
  blocking: boolean
  series: SurtrDpsOutputSeries[]
}

/** Builds independent export panels, each compared with its own matching baseline. */
export function buildSurtrDpsBlockComparison(
  record: SkillRecord,
  settings: SurtrDpsSettings,
  modules: readonly SurtrDpsBlockComparisonModule[],
  metric: SurtrDpsMetric,
  baselineId: string,
): SurtrDpsBlockComparison[] | null {
  if (!modules.length) return null
  const panels: SurtrDpsBlockComparison[] = []
  for (const blocking of [false, true]) {
    const series: SurtrDpsOutputSeries[] = []
    for (const module of modules) {
      const model = deriveSurtrDpsModel(record, { ...settings, blocking }, module.id, module.level)
      if (!model) return null
      const curve = buildSurtrDpsCurve(model)
      if (!curve.length) return null
      series.push({
        id: module.id || 'none', label: module.label, color: module.color,
        points: curve.map(point => ({ x: point.resistance, value: point.dps })),
      })
    }
    panels.push({ blocking, series: transformSurtrDpsSeries(series, metric, baselineId || 'none') })
  }
  return panels
}

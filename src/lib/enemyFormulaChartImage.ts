import { createChartImageFilename, formatChartFilenameValues, withChartImageAspect } from './chartImageFilename.ts'
import type { CorrespondenceModel, CorrespondencePoint } from './enemyDefenseResistanceFormula.ts'

export interface EnemyFormulaChartImageSnapshot {
  points: readonly CorrespondencePoint[]
  model: CorrespondenceModel
  probe: number | null
  versionId: string
  scopeLabel: string
  total: number
  methodLabel: string
}

export const ENEMY_FORMULA_CHART_IMAGE_TITLE = '防御力・術耐性の対応式'
const NUMBER = new Intl.NumberFormat('ja-JP', { maximumSignificantDigits: 12 })

function getActiveParameters(snapshot: EnemyFormulaChartImageSnapshot): string[] {
  const { model, probe } = snapshot
  const parameters: string[] = []
  if (model.method === 'polynomial') parameters.push(`${model.segments[0].coefficients.length - 1}次`)
  if (model.method === 'piecewise') {
    const breakpoints = model.segments.slice(0, -1).map(segment => segment.to)
    if (breakpoints.length > 0) parameters.push(`区切り${formatChartFilenameValues(breakpoints)}`)
  }
  if (probe !== null && Number.isFinite(probe) && model.predict(probe) !== null) {
    parameters.push(`術耐性${probe}強調`)
  }
  return parameters
}

export function getEnemyFormulaChartImageConditions(snapshot: EnemyFormulaChartImageSnapshot): string {
  return [
    `集計版 ${snapshot.versionId}`,
    snapshot.scopeLabel,
    `出現回数 ${NUMBER.format(snapshot.total)}体`,
    ...getActiveParameters(snapshot),
  ].join('・')
}

export function getEnemyFormulaChartImageFilename(snapshot: EnemyFormulaChartImageSnapshot, aspectRatio?: number): string {
  const filename = createChartImageFilename('敵', [
    `集計${snapshot.versionId}`,
    ENEMY_FORMULA_CHART_IMAGE_TITLE,
    snapshot.scopeLabel,
    '出現回数',
    snapshot.methodLabel,
    ...getActiveParameters(snapshot),
  ])
  return withChartImageAspect(filename, aspectRatio)
}

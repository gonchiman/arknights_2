import { TABLE_CHART_VIEWS, viewLabel, type TableChartView } from './PageViewSwitch'

export const ENEMY_COMPARISON_TITLE = '出現敵での比較'
export const ENEMY_ANALYSES = [
  ['advantage', '属性別の優勢率'],
  ['meanDamage', '平均ダメージ'],
  ['histogram', 'スキル別の物理優勢率分布'],
  ['operatorVotes', 'オペレーター別の票'],
] as const
export type EnemyAnalysis = typeof ENEMY_ANALYSES[number][0]

export function getEnemyAnalysisSegments(analysis: EnemyAnalysis, format: TableChartView) {
  const label = viewLabel(ENEMY_ANALYSES, analysis)
  if (analysis === 'operatorVotes') return [label]
  return [label, analysis === 'histogram' ? 'ヒストグラム' : viewLabel(TABLE_CHART_VIEWS, format)]
}

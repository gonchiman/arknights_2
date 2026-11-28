import { TABLE_CHART_VIEWS, viewLabel, type TableChartView } from './PageViewSwitch'

export const ENEMY_COMPARISON_TITLE = '出現敵での比較'
export const ENEMY_ATTACK_QUARTILES_TITLE = '最終攻撃力別の優勢率'
export const ENEMY_SPAWN_COMPOSITION_TITLE = '出現回数の内訳'
export const ENEMY_ANALYSES = [
  ['advantage', '属性別の優勢率'],
  ['attackQuartiles', ENEMY_ATTACK_QUARTILES_TITLE],
  ['meanDamage', '平均ダメージ'],
  ['histogram', 'スキル別の物理優勢率分布'],
  ['operatorVotes', 'オペレーター別の票'],
  ['spawnComposition', ENEMY_SPAWN_COMPOSITION_TITLE],
] as const
export type EnemyAnalysis = typeof ENEMY_ANALYSES[number][0]

export function getEnemyAnalysisSegments(analysis: EnemyAnalysis, format: TableChartView) {
  const label = viewLabel(ENEMY_ANALYSES, analysis)
  if (analysis === 'operatorVotes' || analysis === 'spawnComposition') return [label]
  if (analysis === 'attackQuartiles') return [label, viewLabel(TABLE_CHART_VIEWS, 'table')]
  return [label, analysis === 'histogram' ? 'ヒストグラム' : viewLabel(TABLE_CHART_VIEWS, format)]
}

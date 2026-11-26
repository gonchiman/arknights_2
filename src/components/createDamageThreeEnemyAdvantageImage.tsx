import type { EnemySpawnAdvantageStatistics } from '../lib/damageThreeEnemySpawnAdvantage'
import type { AdvantageUnit } from '../lib/damageThreeSkillRankStatistics'
import type { ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import type { DamageCalculatorThreeAttributeChartImageSnapshot } from './DamageCalculatorThreeAttributeChartImageDialog'
import { DamageThreeAdvantageImageLegend } from './DamageThreeAdvantageChartImage'
import { DamageThreeEnemyAdvantagePlot, DamageThreeEnemyAdvantageTable, getEnemyAdvantagePlotHeight } from './DamageThreeEnemyAdvantageViews'
import { getDamageThreeStatisticsImageConditions, type StatisticsImageConditions } from './createDamageThreeStatisticsChartImage'
import type { TableChartView } from './PageViewSwitch'

export type EnemyAdvantageImage =
  | { view: 'chart'; snapshot: DamageCalculatorThreeAttributeChartImageSnapshot }
  | { view: 'table'; snapshot: ComparisonTableImageSnapshot }

interface EnemyAdvantageImageOptions extends StatisticsImageConditions {
  statistics: EnemySpawnAdvantageStatistics
  advantageUnit: AdvantageUnit
  showBands: boolean
  format: TableChartView
}

export function createDamageThreeEnemyAdvantageImage({
  statistics, advantageUnit, showBands, format, ...options
}: EnemyAdvantageImageOptions): EnemyAdvantageImage | null {
  const total = statistics.rows[0]
  if (!total?.[advantageUnit].count) return null
  const rows = showBands ? statistics.rows : [total]
  const { source, settings } = getDamageThreeStatisticsImageConditions(options)
  const filenameParts = [...source, showBands ? '防御力帯別の内訳' : '全体のみ',
    advantageUnit === 'skill' ? 'スキル単位' : '段階単位', ...settings]
  const count = advantageUnit === 'skill' ? `${statistics.skillCount.toLocaleString('ja-JP')}スキル` : `${statistics.stageCount.toLocaleString('ja-JP')}段階`
  const conditions = [...filenameParts, `出現回数 ${total.spawnCount.toLocaleString('ja-JP')}`, count]
  const title = '出現敵での優勢率'

  if (format === 'table') {
    return { view: 'table', snapshot: {
      title, conditions, filenameConditions: ['表', ...filenameParts],
      table: <DamageThreeEnemyAdvantageTable rows={rows} unit={advantageUnit} />,
    } }
  }
  return { view: 'chart', snapshot: {
    title, conditions, filenameParts: ['グラフ', ...filenameParts],
    axisTitle: '出現回数で重み付けした優勢率（%）',
    naturalChartHeight: getEnemyAdvantagePlotHeight(rows.length),
    legend: <DamageThreeAdvantageImageLegend />,
    chart: size => <DamageThreeEnemyAdvantagePlot rows={rows} unit={advantageUnit} {...size} />,
  } }
}

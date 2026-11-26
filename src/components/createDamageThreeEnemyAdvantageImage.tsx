import type { EnemySpawnAdvantageStatistics } from '../lib/damageThreeEnemySpawnAdvantage'
import type { AdvantageUnit } from '../lib/damageThreeSkillRankStatistics'
import type { ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import type { DamageCalculatorThreeAttributeChartImageSnapshot } from './DamageCalculatorThreeAttributeChartImageDialog'
import { DamageThreeAdvantageImageLegend } from './DamageThreeAdvantageChartImage'
import { DamageThreeEnemyAdvantagePlot, DamageThreeEnemyAdvantageTable, getEnemyAdvantagePlotHeight } from './DamageThreeEnemyAdvantageViews'
import { DamageThreeSkillPhysicalRatePlot, SKILL_PHYSICAL_RATE_AXIS, SKILL_PHYSICAL_RATE_TITLE } from './DamageThreeSkillPhysicalRateHistogram'
import { getDamageThreeStatisticsImageConditions, type StatisticsImageConditions } from './createDamageThreeStatisticsChartImage'
import { TABLE_CHART_VIEWS } from './PageViewSwitch'

export const ENEMY_ADVANTAGE_VIEWS = [...TABLE_CHART_VIEWS, ['histogram', 'スキル別の分布']] as const
export type EnemyAdvantageView = typeof ENEMY_ADVANTAGE_VIEWS[number][0]

export type EnemyAdvantageImage =
  | { view: 'chart'; snapshot: DamageCalculatorThreeAttributeChartImageSnapshot }
  | { view: 'table'; snapshot: ComparisonTableImageSnapshot }

interface EnemyAdvantageImageOptions extends StatisticsImageConditions {
  statistics: EnemySpawnAdvantageStatistics
  advantageUnit: AdvantageUnit
  showBands: boolean
  format: EnemyAdvantageView
}

export function createDamageThreeEnemyAdvantageImage({
  statistics, advantageUnit, showBands, format, ...options
}: EnemyAdvantageImageOptions): EnemyAdvantageImage | null {
  const total = statistics.rows[0]
  if (!total?.[format === 'histogram' ? 'skill' : advantageUnit].count) return null
  const { source, settings } = getDamageThreeStatisticsImageConditions(options)
  const spawnCount = `出現回数 ${total.spawnCount.toLocaleString('ja-JP')}`
  if (format === 'histogram') {
    const bins = statistics.skillPhysicalRateBins
    const filenameParts = [...source, ...settings]
    return { view: 'chart', snapshot: {
      title: SKILL_PHYSICAL_RATE_TITLE, axisTitle: SKILL_PHYSICAL_RATE_AXIS,
      filenameParts, conditions: [...filenameParts, spawnCount, `有効スキル数 ${statistics.skillCount.toLocaleString('ja-JP')}`],
      legend: null, chart: size => <DamageThreeSkillPhysicalRatePlot {...size} bins={bins} />,
    } }
  }
  const rows = showBands ? statistics.rows : [total]
  const filenameParts = [...source, showBands ? '防御力帯別の内訳' : '全体のみ',
    advantageUnit === 'skill' ? 'スキル単位' : '段階単位', ...settings]
  const count = advantageUnit === 'skill' ? `${statistics.skillCount.toLocaleString('ja-JP')}スキル` : `${statistics.stageCount.toLocaleString('ja-JP')}段階`
  const conditions = [...filenameParts, spawnCount, count]
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

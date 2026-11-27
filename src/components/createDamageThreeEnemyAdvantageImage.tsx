import type { EnemySpawnAdvantageStatistics } from '../lib/damageThreeEnemySpawnAdvantage'
import type { AdvantageUnit } from '../lib/damageThreeSkillRankStatistics'
import type { ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import type { ChartImageAlternateLayout, DamageCalculatorThreeAttributeChartImageSnapshot } from './DamageCalculatorThreeAttributeChartImageDialog'
import { DamageThreeAdvantageImageLegend } from './DamageThreeAdvantageChartImage'
import { DamageThreeEnemyAdvantageLabeledPlot, ENEMY_ADVANTAGE_LABELED_PLOT_HEIGHT } from './DamageThreeEnemyAdvantageLabeledPlot'
import { DamageThreeEnemyAdvantagePlot, DamageThreeEnemyAdvantageTable, DamageThreeEnemyMeanDamageTable, ENEMY_MEAN_DAMAGE_TITLE, getEnemyAdvantagePlotHeight } from './DamageThreeEnemyAdvantageViews'
import {
  DamageThreeEnemyMeanDamageLegend, DamageThreeEnemyMeanDamageOverallPlot, DamageThreeEnemyMeanDamagePlot,
  ENEMY_MEAN_DAMAGE_AXIS, ENEMY_MEAN_DAMAGE_OVERALL_HEIGHT, getEnemyMeanDamagePlotHeight,
} from './DamageThreeEnemyMeanDamageChart'
import { DamageThreeSkillPhysicalRatePlot, SKILL_PHYSICAL_RATE_AXIS, SKILL_PHYSICAL_RATE_TITLE } from './DamageThreeSkillPhysicalRateHistogram'
import { getDamageThreeStatisticsImageConditions, type StatisticsImageConditions } from './createDamageThreeStatisticsChartImage'
import { TABLE_CHART_VIEWS, type TableChartView } from './PageViewSwitch'

export const ENEMY_ADVANTAGE_VIEWS = [...TABLE_CHART_VIEWS, ['meanDamage', '平均ダメージ'], ['histogram', 'スキル別の分布'], ['operatorVotes', 'オペレーター別の票']] as const
export type EnemyAdvantageView = typeof ENEMY_ADVANTAGE_VIEWS[number][0]

export type EnemyAdvantageImage =
  | { view: 'chart'; snapshot: DamageCalculatorThreeAttributeChartImageSnapshot; alternateLayout?: ChartImageAlternateLayout }
  | { view: 'table'; snapshot: ComparisonTableImageSnapshot }

interface EnemyAdvantageImageOptions extends StatisticsImageConditions {
  statistics: Omit<EnemySpawnAdvantageStatistics, 'operators'>
  advantageUnit: AdvantageUnit
  showBands: boolean
  format: Exclude<EnemyAdvantageView, 'operatorVotes'>
  meanDamageFormat?: TableChartView
}

export function createDamageThreeEnemyAdvantageImage({
  statistics, advantageUnit, showBands, format, meanDamageFormat = 'table', ...options
}: EnemyAdvantageImageOptions): EnemyAdvantageImage | null {
  const total = statistics.rows[0]
  const unit = format === 'meanDamage' || format === 'histogram' ? 'skill' : advantageUnit
  if (!total?.[unit].count) return null
  const { source, settings } = getDamageThreeStatisticsImageConditions(options)
  const [versionLabel, scopeLabel] = source
  const totalSpawns = format === 'meanDamage' ? total.meanDamage?.spawnCount : total.spawnCount
  if (!totalSpawns) return null
  const spawnCountNumber = totalSpawns.toLocaleString('ja-JP')
  const spawnCount = `出現回数 ${spawnCountNumber}`
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
  const unitLabel = unit === 'skill' ? 'スキル単位' : '段階単位'
  const filenameParts = [...source, showBands ? '防御力帯別の内訳' : '全体のみ', unitLabel, ...settings]
  const count = unit === 'skill' ? `${statistics.skillCount.toLocaleString('ja-JP')}スキル` : `${statistics.stageCount.toLocaleString('ja-JP')}段階`
  const conditions = [...filenameParts, spawnCount, count]
  const title = format === 'meanDamage' ? ENEMY_MEAN_DAMAGE_TITLE : '出現敵での優勢率'

  if (format === 'meanDamage' && meanDamageFormat === 'chart') {
    const meanDamage = total.meanDamage
    if (!showBands && meanDamage) {
      return { view: 'chart', snapshot: {
        title, filenameParts: ['グラフ', ...filenameParts],
        conditions: [scopeLabel, `出現${spawnCountNumber}回`, count],
        footerNote: [versionLabel, unitLabel, ...settings].join('・'),
        className: 'dc3-chart-image-centered-heading', legend: null, axisTitle: '',
        defaultAspect: { preset: '16:9', width: '16', height: '9' },
        naturalChartHeight: ENEMY_MEAN_DAMAGE_OVERALL_HEIGHT,
        chart: size => <DamageThreeEnemyMeanDamageOverallPlot meanDamage={meanDamage} {...size} />,
      } }
    }
    return { view: 'chart', snapshot: {
      title, conditions, filenameParts: ['グラフ', ...filenameParts], axisTitle: ENEMY_MEAN_DAMAGE_AXIS,
      naturalChartHeight: getEnemyMeanDamagePlotHeight(rows.length),
      legend: <DamageThreeEnemyMeanDamageLegend />,
      chart: size => <DamageThreeEnemyMeanDamagePlot rows={rows} {...size} />,
    } }
  }
  if (format === 'table' || format === 'meanDamage') {
    return { view: 'table', snapshot: {
      title, conditions, filenameConditions: ['表', ...filenameParts],
      table: format === 'meanDamage' ? <DamageThreeEnemyMeanDamageTable rows={rows} /> : <DamageThreeEnemyAdvantageTable rows={rows} unit={unit} />,
    } }
  }
  const snapshot: DamageCalculatorThreeAttributeChartImageSnapshot = {
    title, conditions, filenameParts: ['グラフ', ...filenameParts],
    axisTitle: '出現回数で重み付けした優勢率（%）',
    naturalChartHeight: getEnemyAdvantagePlotHeight(rows.length),
    legend: <DamageThreeAdvantageImageLegend />,
    chart: size => <DamageThreeEnemyAdvantagePlot rows={rows} unit={advantageUnit} {...size} />,
  }
  if (showBands) return { view: 'chart', snapshot }

  return { view: 'chart', snapshot, alternateLayout: {
    label: '割合を棒の上に表示',
    defaultAspect: { preset: '16:9', width: '16', height: '9' },
    snapshot: {
      title, conditions: [scopeLabel, spawnCount, count],
      filenameParts: ['グラフ', '割合を棒上に表示', ...filenameParts],
      axisTitle: '', footerNote: ['出現回数で重み付け', unitLabel, ...settings, versionLabel].join('・'),
      className: 'dc3-chart-image-centered-heading', legend: null,
      naturalChartHeight: ENEMY_ADVANTAGE_LABELED_PLOT_HEIGHT,
      chart: size => <DamageThreeEnemyAdvantageLabeledPlot row={total} unit={advantageUnit} {...size} />,
    },
  } }
}

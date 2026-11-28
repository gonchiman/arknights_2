import type { EnemyOutlierScope, EnemySpawnAdvantageStatistics } from '../lib/damageThreeEnemySpawnAdvantage'
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
import { ENEMY_ADVANTAGE_BREAKDOWNS, ENEMY_OUTLIER_SCOPES, formatEnemyOutlierFences, getEnemyAdvantageDisplayRows, getVisibleEnemyAdvantageRows, type EnemyAdvantageBreakdown } from './enemyAdvantageBreakdown'
import { viewLabel, type TableChartView } from './PageViewSwitch'

export type EnemyAdvantageImage =
  | { view: 'chart'; snapshot: DamageCalculatorThreeAttributeChartImageSnapshot; alternateLayout?: ChartImageAlternateLayout }
  | { view: 'table'; snapshot: ComparisonTableImageSnapshot }

interface EnemyAdvantageImageOptions extends StatisticsImageConditions {
  statistics: Omit<EnemySpawnAdvantageStatistics, 'operators'>
  advantageUnit: AdvantageUnit
  showBands: boolean
  breakdown?: EnemyAdvantageBreakdown
  outlierScope?: EnemyOutlierScope
  hiddenChartCategories?: readonly string[]
  format: TableChartView | 'meanDamage' | 'histogram'
  meanDamageFormat?: TableChartView
}

export function createDamageThreeEnemyAdvantageImage({
  statistics, advantageUnit, showBands, breakdown, outlierScope = 'all', hiddenChartCategories = [], format, meanDamageFormat = 'table', ...options
}: EnemyAdvantageImageOptions): EnemyAdvantageImage | null {
  const outlierRows = (format === 'chart' || format === 'table') && breakdown === 'outlier'
    ? statistics.outliers[outlierScope] : null
  const total = statistics.rows[0]
  const unit = format === 'meanDamage' || format === 'histogram' ? 'skill' : advantageUnit
  if (!total || (!outlierRows && !total[unit].count)) return null
  const { source, settings } = getDamageThreeStatisticsImageConditions(options)
  const [versionLabel, scopeLabel] = source
  const totalSpawns = format === 'meanDamage' ? total.meanDamage?.spawnCount : (outlierRows?.[0] ?? total).spawnCount
  if (totalSpawns === undefined || (!outlierRows && !totalSpawns)) return null
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
  const bandMode = showBands ? 'defense' : 'all'
  const mode = format === 'meanDamage' ? bandMode : breakdown ?? bandMode
  const unitLabel = unit === 'skill' ? 'スキル単位' : '段階単位'
  const breakdownLabel = mode === 'all' ? '全体のみ' : mode === 'defense' ? '防御力帯別の内訳' : viewLabel(ENEMY_ADVANTAGE_BREAKDOWNS, mode)
  const target = outlierRows ? [viewLabel(ENEMY_OUTLIER_SCOPES, outlierScope)] : []
  const comparisonSettings = [unitLabel, ...settings]
  const filenameParts = outlierRows
    ? [...source, '外れ値別', ...target, formatEnemyOutlierFences(statistics.outliers, true), ...comparisonSettings]
    : [...source, breakdownLabel, ...comparisonSettings]
  const count = unit === 'skill' ? `${statistics.skillCount.toLocaleString('ja-JP')}スキル` : `${statistics.stageCount.toLocaleString('ja-JP')}段階`
  const conditions = [...source, breakdownLabel, ...target, ...comparisonSettings, spawnCount,
    outlierRows && outlierScope !== 'all' ? `全敵で有効 ${count}` : count]
  if (outlierRows) conditions.push(formatEnemyOutlierFences(statistics.outliers))
  const title = format === 'meanDamage' ? ENEMY_MEAN_DAMAGE_TITLE : '出現敵での優勢率'

  if (format === 'meanDamage') {
    const rows = showBands ? statistics.rows : [total]
    if (meanDamageFormat === 'table') {
      return { view: 'table', snapshot: {
        title, conditions, filenameConditions: ['表', ...filenameParts], table: <DamageThreeEnemyMeanDamageTable rows={rows} />,
      } }
    }
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
  const rows = outlierRows ?? getEnemyAdvantageDisplayRows(statistics, mode, options.filters.profession, options.filters.rarity)
  if (format === 'table') {
    return { view: 'table', snapshot: {
      title, conditions, filenameConditions: ['表', ...filenameParts],
      defaultOutput: { width: 1920, aspect: { preset: '16:9', width: '16', height: '9' } },
      table: <DamageThreeEnemyAdvantageTable rows={rows} unit={unit} breakdown={mode} />,
    } }
  }
  const visibleRows = getVisibleEnemyAdvantageRows(rows, hiddenChartCategories)
  if (!visibleRows.length) return null
  const selection = visibleRows.length === rows.length ? [] : [`表示 ${visibleRows.map(row => row.label).join('・')}`]
  const snapshot: DamageCalculatorThreeAttributeChartImageSnapshot = {
    title, conditions: [...conditions, ...selection],
    filenameParts: outlierRows ? ['グラフ', ...filenameParts, ...selection] : ['グラフ', ...selection, ...filenameParts],
    axisTitle: '出現回数で重み付けした優勢率（%）',
    naturalChartHeight: getEnemyAdvantagePlotHeight(visibleRows.length),
    legend: <DamageThreeAdvantageImageLegend />,
    chart: size => <DamageThreeEnemyAdvantagePlot rows={visibleRows} unit={unit} breakdown={mode} {...size} />,
  }
  if (mode !== 'all') return { view: 'chart', snapshot }

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

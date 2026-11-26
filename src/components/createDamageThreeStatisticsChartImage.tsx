import { DAMAGE_THREE_OUTPUT_KIND_LABELS } from '../lib/damageCalculatorThreeComparison'
import { DAMAGE_DISTRIBUTION_AXIS_TITLE, getDamageThreeDistributionHistogram } from '../lib/damageThreeDistributionChart'
import { DAMAGE_TYPE_LABELS, type DamageThreeSkillFilterValues } from '../lib/damageThreeSkillFilters'
import type { AdvantageUnit, SkillRankStatistics } from '../lib/damageThreeSkillRankStatistics'
import { getProfessionLabel } from '../lib/operatorFilters'
import type { DamageCalculatorThreeAttributeChartImageSnapshot } from './DamageCalculatorThreeAttributeChartImageDialog'
import { DamageThreeAdvantageChartImage, DamageThreeAdvantageImageLegend, getAdvantageChartAxisTitle } from './DamageThreeAdvantageChartImage'
import { DamageThreeDistributionChartImage, DamageThreeDistributionImageLegend } from './DamageThreeDistributionChartImage'
import type { StatisticView } from './DamageThreeSkillRankStatisticsTable'
import { ENEMY_MAIN_STORY_LABEL, type EnemyAggregationScope } from './EnemyAggregationScopeSelector'

export interface StatisticsImageConditions {
  aggregationVersion: string
  scope: EnemyAggregationScope
  comparisonPolicy: 'excludeAttributeEffects' | 'apply'
  filters: DamageThreeSkillFilterValues
}

interface StatisticsImageOptions extends StatisticsImageConditions {
  rows: readonly SkillRankStatistics[]
  view: StatisticView
  resistance: number
  advantageUnit: AdvantageUnit
}

export function getDamageThreeStatisticsImageConditions({
  aggregationVersion, scope, comparisonPolicy, filters,
}: StatisticsImageConditions) {
  const source = [`集計版 ${aggregationVersion}`, scope === 'main' ? ENEMY_MAIN_STORY_LABEL : '全体']
  const settings = [
    comparisonPolicy === 'apply' ? '属性限定効果を適用' : '属性限定効果を除外',
    filters.kind === 'ALL' ? '全出力型' : DAMAGE_THREE_OUTPUT_KIND_LABELS[filters.kind],
  ]
  if (filters.profession !== 'ALL') settings.push(getProfessionLabel(filters.profession))
  if (filters.rarity !== 'ALL') settings.push(`★${filters.rarity}`)
  if (filters.damageType !== 'ALL') settings.push(`元の攻撃属性 ${DAMAGE_TYPE_LABELS[filters.damageType]}`)
  if (filters.query.trim()) settings.push(`検索「${filters.query.trim()}」`)
  return { source, settings }
}

export function createDamageThreeStatisticsChartImage({
  rows, view, resistance, advantageUnit, ...options
}: StatisticsImageOptions): DamageCalculatorThreeAttributeChartImageSnapshot | null {
  const { source, settings } = getDamageThreeStatisticsImageConditions(options)
  if (view === 'distribution') {
    const histogram = getDamageThreeDistributionHistogram(rows, resistance)
    if (!histogram) return null
    const { row } = histogram
    const conditions = [...source, `術耐性 ${row.resistance}`, `対応防御力 ${row.defense.toLocaleString('ja-JP')}`, ...settings]
    return {
      title: '主攻撃1回のダメージ分布',
      conditions: [...conditions, `有効段階数 ${row.count.toLocaleString('ja-JP')}`],
      filenameParts: conditions,
      axisTitle: DAMAGE_DISTRIBUTION_AXIS_TITLE,
      legend: <DamageThreeDistributionImageLegend />,
      chart: size => <DamageThreeDistributionChartImage {...size} histogram={histogram} />,
    }
  }

  if (!rows.some(row => row.count > 0)) return null
  const conditions = [...source, advantageUnit === 'skill' ? 'スキル単位' : '段階単位', ...settings]
  return {
    title: '属性別の優勢率',
    conditions,
    filenameParts: conditions,
    axisTitle: getAdvantageChartAxisTitle(advantageUnit),
    additionalChartHeight: 66,
    legend: <DamageThreeAdvantageImageLegend />,
    chart: size => <DamageThreeAdvantageChartImage {...size} rows={rows} advantageUnit={advantageUnit} />,
  }
}

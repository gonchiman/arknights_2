import { useState, type ReactElement } from 'react'
import { ADVANTAGE_LEGEND, ADVANTAGE_OUTCOMES } from '../lib/damageThreeAdvantageChart'
import type { EnemyOperatorVoteSummary } from '../lib/damageThreeEnemySpawnAdvantage'
import { STANDARD_PAGE_TITLES } from '../lib/navigation'
import { ComparisonTableImageDialog, type ComparisonTableImageSnapshot } from './ComparisonTableImageDialog'
import { getDamageThreeStatisticsImageConditions, type StatisticsImageConditions } from './createDamageThreeStatisticsChartImage'
import { DamageCalculatorThreeAttributeChartImageDialog, type ChartImageAlternateLayout, type DamageCalculatorThreeAttributeChartImageSnapshot } from './DamageCalculatorThreeAttributeChartImageDialog'
import { DamageThreeAdvantageImageLegend } from './DamageThreeAdvantageChartImage'
import { getEnemyAdvantagePlotHeight, OperatorSkillVotesPlot } from './DamageThreeEnemyAdvantageViews'
import { DamageThreeStatisticsImageLegend } from './DamageThreeStatisticsImageLegend'
import { ENEMY_ANALYSES, ENEMY_COMPARISON_TITLE } from './enemyComparisonViews'
import { getOperatorSkillVoteImageHeight, OperatorSkillVoteImagePlot } from './OperatorSkillVoteImagePlot'
import { OutputImageSaveButton } from './OutputImageSaveButton'
import { TABLE_CHART_VIEWS, type TableChartView, viewLabel } from './PageViewSwitch'

export function getOperatorVotesSegments(detail = false, view: TableChartView = 'table') {
  const parent = [ENEMY_COMPARISON_TITLE, viewLabel(ENEMY_ANALYSES, 'operatorVotes')]
  if (detail) return [...parent, '段階ごとの判定']
  return [...parent, 'スキル別の得票', viewLabel(TABLE_CHART_VIEWS, view)]
}

interface OperatorVotesImageProps {
  conditions: StatisticsImageConditions
  operatorName: string
  spawnCount: number
  detail?: { skillIndex: number; skillName: string; defense: number; resistance: number }
  table: ReactElement
}

export function OperatorVotesImageButton({ conditions, operatorName, spawnCount, detail, table }: OperatorVotesImageProps) {
  const [snapshot, setSnapshot] = useState<ComparisonTableImageSnapshot | null>(null)
  const segments = getOperatorVotesSegments(Boolean(detail))
  function open() {
    const { source, settings } = getDamageThreeStatisticsImageConditions(conditions)
    const selection = detail
      ? [operatorName, `S${detail.skillIndex} ${detail.skillName}`, `防御力 ${detail.defense.toLocaleString('ja-JP')}`, `術耐性 ${detail.resistance.toLocaleString('ja-JP')}`]
      : [operatorName]
    const filenameConditions = [...selection, ...source, 'スキル単位', ...settings]
    setSnapshot({
      title: segments[2], filenameConditions,
      conditions: [...filenameConditions, `出現回数 ${spawnCount.toLocaleString('ja-JP')}`],
      table,
    })
  }
  return <>
    <OutputImageSaveButton onClick={open} />
    {snapshot && <ComparisonTableImageDialog snapshot={snapshot}
      parentLocation={[STANDARD_PAGE_TITLES['damage-three-skill-attribute-matrix'], ...segments]}
      onClose={() => setSnapshot(null)} />}
  </>
}

interface OperatorVotesChartImageProps {
  conditions: StatisticsImageConditions
  operator: EnemyOperatorVoteSummary
  spawnCount: number
}

interface OperatorVotesChartImage {
  snapshot: DamageCalculatorThreeAttributeChartImageSnapshot
  alternateLayout: ChartImageAlternateLayout
}

const DIRECT_VOTE_LEGEND = ADVANTAGE_OUTCOMES.map(({ series, label }) => ({
  series, label: series === 'tie' ? label : `${label}が高い`,
}))

export function createOperatorVotesChartImage({ conditions, operator, spawnCount }: OperatorVotesChartImageProps): OperatorVotesChartImage {
  const { source, settings } = getDamageThreeStatisticsImageConditions(conditions)
  const [versionLabel, scopeLabel] = source
  const filenameConditions = [...source, 'スキル単位', ...settings]
  const count = spawnCount.toLocaleString('ja-JP')
  const label = '割合を棒に直接表示'
  return {
    snapshot: {
      title: 'スキル別の得票',
      conditions: [operator.operatorName, ...filenameConditions, `出現回数 ${count}`],
      axisTitle: '得票率（%）',
      filenameParts: ['グラフ', operator.operatorName, ...filenameConditions],
      naturalChartHeight: getEnemyAdvantagePlotHeight(operator.skills.length),
      legend: <DamageThreeAdvantageImageLegend />,
      chart: size => <OperatorSkillVotesPlot operator={operator} {...size} />,
    },
    alternateLayout: {
      label,
      defaultAspect: { preset: '16:9', width: '16', height: '9' },
      snapshot: {
        title: `${operator.operatorName}｜物理・術の優勢率（スキル別）`,
        conditions: ['主攻撃を物理・術に切り替えて比較'],
        axisTitle: '',
        footerNote: [`${scopeLabel}・敵の出現回数 ${count}`,
          ['出現回数で重み付け', 'スキル単位', ...settings, versionLabel].join('・')].join('\n'),
        filenameParts: ['グラフ', label, ...filenameConditions],
        className: 'dc3-skill-vote-labeled-image',
        naturalChartHeight: getOperatorSkillVoteImageHeight(operator),
        legend: <DamageThreeStatisticsImageLegend items={DIRECT_VOTE_LEGEND} label={ADVANTAGE_LEGEND} />,
        chart: size => <OperatorSkillVoteImagePlot operator={operator} {...size} />,
      },
    },
  }
}

export function OperatorVotesChartImageButton(props: OperatorVotesChartImageProps) {
  const [image, setImage] = useState<OperatorVotesChartImage | null>(null)
  const segments = getOperatorVotesSegments(false, 'chart')
  return <>
    <OutputImageSaveButton onClick={() => setImage(createOperatorVotesChartImage(props))} />
    {image && <DamageCalculatorThreeAttributeChartImageDialog snapshot={image.snapshot} alternateLayout={image.alternateLayout}
      parentLocation={[STANDARD_PAGE_TITLES['damage-three-skill-attribute-matrix'], ...segments]}
      onClose={() => setImage(null)} />}
  </>
}

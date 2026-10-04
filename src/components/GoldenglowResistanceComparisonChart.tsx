import { useMemo } from 'react'
import type { ResistanceComparisonDisplaySeries } from '../lib/goldenglowResistanceComparison'
import type { HpComparisonMetric } from '../lib/goldenglowTargetSwitchHpComparison'
import { getHpRankBands } from '../lib/hpRankBands'
import { getHpComparisonSeriesStyles, type HpChartGridStyle } from './GoldenglowTargetSwitchHpChart'
import {
  GroupedResistanceComparisonChart, GroupedResistanceComparisonChartSvg, getGroupedResistanceChartSeries,
  type GroupedResistanceComparisonSeries, type GroupedResistanceComparisonAxis,
} from './GroupedResistanceComparisonChart'

export interface ResistanceComparisonChartProps {
  series: readonly ResistanceComparisonDisplaySeries[]
  enemyHps: readonly number[]
  enemyResistances: readonly number[]
  metric: HpComparisonMetric
  baselineId: string
  hideBaseline?: boolean
  digits?: number
  selectedHp: number | null
  selectedResistance: number | null
  onSelectPoint: (hp: number, resistance: number) => void
  stale?: boolean
  showHpRanks?: boolean
  gridStyle?: HpChartGridStyle
}

type SvgProps = Omit<ResistanceComparisonChartProps, 'selectedHp' | 'selectedResistance' | 'onSelectPoint' | 'stale'> & {
  width: number
  height: number
}

const integerFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 })

/** Preserve the GG image legend API and its colors before hiding or sorting series. */
export function getResistanceChartSeries(series: readonly ResistanceComparisonDisplaySeries[], hideBaseline = false, baselineId = '') {
  const styles = getHpComparisonSeriesStyles(series)
  return getGroupedResistanceChartSeries(series.map((item, index) => ({ ...item, style: styles[index] })), hideBaseline, baselineId)
}

function useHpChartData(series: readonly ResistanceComparisonDisplaySeries[], enemyHps: readonly number[], showHpRanks = true) {
  const chartSeries = useMemo<GroupedResistanceComparisonSeries[]>(() => {
    const styles = getHpComparisonSeriesStyles(series)
    return series.map((item, index) => ({
      ...item,
      color: styles[index].color,
      points: item.points.map((point) => ({ groupValue: point.enemyHp, resistance: point.enemyResistance, value: point.value })),
    }))
  }, [series])
  const groupAxis = useMemo<GroupedResistanceComparisonAxis>(() => {
    const hps = [...new Set(enemyHps)].filter((hp) => Number.isFinite(hp) && hp > 0).sort((a, b) => a - b)
    return {
      label: '敵HP', formatValue: (hp) => integerFormat.format(hp), minimum: Number.MIN_VALUE,
      regionLabel: 'HP・術耐性比較グラフ', dataAttribute: 'data-enemy-hp',
      rankBands: showHpRanks && hps.length ? getHpRankBands({
        chartKind: 'bar', minHp: hps[0], maxHp: hps.at(-1)!, barHps: hps,
      }) : [],
    }
  }, [enemyHps, showHpRanks])
  return { chartSeries, groupAxis }
}

export function GoldenglowResistanceComparisonChart({ series, enemyHps, enemyResistances, selectedHp, showHpRanks, ...props }: ResistanceComparisonChartProps) {
  const { chartSeries, groupAxis } = useHpChartData(series, enemyHps, showHpRanks)
  return <GroupedResistanceComparisonChart {...props} series={chartSeries} groupValues={enemyHps}
    resistanceValues={enemyResistances} groupAxis={groupAxis} selectedGroup={selectedHp} />
}

export function GoldenglowResistanceComparisonChartSvg({ series, enemyHps, enemyResistances, showHpRanks, ...props }: SvgProps) {
  const { chartSeries, groupAxis } = useHpChartData(series, enemyHps, showHpRanks)
  return <GroupedResistanceComparisonChartSvg {...props} series={chartSeries} groupValues={enemyHps}
    resistanceValues={enemyResistances} groupAxis={groupAxis} />
}

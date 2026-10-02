import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { EnemyRecord } from '../types/enemy'
import type { EnemyComparisonCondition } from '../lib/enemyDistributionComparison'
import type { EnemyThresholdComparison } from '../lib/enemyThresholdComparison'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCountMode } from '../lib/enemyHistogramCounts'
import type { EnemyThresholdPieLabelLayout } from '../lib/enemyThresholdPieLayout'
import { ChartImageFrame } from './ChartImageFrame'
import { EnemyComparisonConditions } from './EnemyComparisonConditions'
import { EnemyThresholdPie, EnemyThresholdPieSvg } from './EnemyThresholdPie'
import './EnemyThresholdPieComparison.css'

interface ComparisonChartProps {
  comparison: EnemyThresholdComparison
  countMode: EnemyHistogramCountMode
  labelLayout: EnemyThresholdPieLabelLayout
}

export function EnemyThresholdPieComparison({ rows, comparison, countMode, labelLayout, onConditionsChange }: ComparisonChartProps & {
  rows: readonly EnemyRecord[]
  onConditionsChange: (conditions: EnemyComparisonCondition[]) => void
}) {
  return <div className="enemy-threshold-pie-comparison">
    <EnemyComparisonConditions rows={rows} conditions={comparison.series.map(({ condition }) => condition)}
      series={comparison.series} onChange={onConditionsChange} countMode={countMode}
      className="enemy-threshold-pie-condition-grid" showSeriesSwatch={false} showCountsInSummary={false}
      renderConditionContent={(condition) => {
        const series = comparison.series.find((item) => item.condition.id === condition.id)
        return series && condition.visible
          ? <EnemyThresholdPie distribution={series.distribution} countMode={countMode} labelLayout={labelLayout} showHeading={false} />
          : null
      }} />
  </div>
}

const IMAGE_COLUMN_GAP = 16
const IMAGE_ROW_GAP = 24
const IMAGE_HEADING_LINE_HEIGHT = 20
const imageBodyHeight = (labelLayout: EnemyThresholdPieLabelLayout) => labelLayout === 'BELOW' ? 334 : 418
const visibleSeries = (comparison: EnemyThresholdComparison) => comparison.series.filter(({ condition }) => condition.visible)
const imageColumnCount = (count: number) => count === 4 ? 2 : Math.max(1, Math.min(3, count))

function initialImageHeadingHeight(comparison: EnemyThresholdComparison) {
  const series = visibleSeries(comparison)
  const columns = imageColumnCount(series.length)
  const availableWidth = (928 - IMAGE_COLUMN_GAP * (columns - 1)) / columns - 16
  const lines = Math.max(1, ...series.map(({ label }) => {
    const textWidth = [...label].reduce((sum, character) => sum + (/^[\x00-\x7f]$/.test(character) ? .65 : 1), 0) * 13
    return Math.ceil(textWidth / availableWidth)
  }))
  return lines * IMAGE_HEADING_LINE_HEIGHT + 14
}

/** Natural plot height excludes the shared export header and outer padding. */
export function getEnemyThresholdPieComparisonNaturalHeight(comparison: EnemyThresholdComparison, labelLayout: EnemyThresholdPieLabelLayout) {
  const series = visibleSeries(comparison)
  const rowCount = Math.max(1, Math.ceil(series.length / imageColumnCount(series.length)))
  return rowCount * (imageBodyHeight(labelLayout) + initialImageHeadingHeight(comparison)) + (rowCount - 1) * IMAGE_ROW_GAP
}

export function EnemyThresholdPieComparisonImage({ comparison, countMode, labelLayout, aspectRatio, onLayout }: ComparisonChartProps & {
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}) {
  const series = visibleSeries(comparison)
  const columns = imageColumnCount(series.length)
  const rowCount = Math.max(1, Math.ceil(series.length / columns))
  const [headingHeight, setHeadingHeight] = useState(() => initialImageHeadingHeight(comparison))
  const measureHeading = useCallback((height: number) => setHeadingHeight((current) => Math.max(current, Math.ceil(height))), [])
  const bodyHeight = imageBodyHeight(labelLayout)
  const naturalChartHeight = rowCount * (bodyHeight + headingHeight) + (rowCount - 1) * IMAGE_ROW_GAP
  const mode = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === countMode)!
  return <ChartImageFrame className="enemy-chart-image enemy-threshold-pie-comparison-image"
    title="敵の術耐性の構成比" legend={<span>{mode.label}</span>}
    conditions={`基準の術耐性 ${String(comparison.threshold)}`}
    naturalChartHeight={naturalChartHeight} aspectRatio={aspectRatio} onLayout={onLayout}>
    {({ width, height }) => <EnemyThresholdPieComparisonImageGrid comparison={comparison} countMode={countMode}
      labelLayout={labelLayout} width={width} height={height} headingHeight={headingHeight} onHeadingHeight={measureHeading} />}
  </ChartImageFrame>
}

function EnemyThresholdPieComparisonImageGrid({ comparison, countMode, labelLayout, width, height, headingHeight, onHeadingHeight }: ComparisonChartProps & {
  width: number
  height: number
  headingHeight: number
  onHeadingHeight: (height: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const series = visibleSeries(comparison)
  const columns = imageColumnCount(series.length)
  const cardWidth = (width - IMAGE_COLUMN_GAP * (columns - 1)) / columns
  useLayoutEffect(() => {
    const headings = Array.from(ref.current?.querySelectorAll<HTMLElement>('.enemy-threshold-pie-image-condition') ?? [])
    const measure = () => onHeadingHeight(Math.max(headingHeight, ...headings.map((heading) => heading.offsetHeight)))
    measure()
    const observer = new ResizeObserver(measure)
    headings.forEach((heading) => observer.observe(heading))
    return () => observer.disconnect()
  }, [comparison, headingHeight, onHeadingHeight])
  return <div className="enemy-threshold-pie-image-grid" ref={ref}
    style={{ width, minHeight: height, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {series.map((item) => <section key={item.condition.id} className="enemy-threshold-pie-image-card"
      data-pie-comparison-condition={item.condition.id} aria-label={item.label}>
      <h3 className="enemy-threshold-pie-image-condition" style={{ minHeight: headingHeight }}>{item.label}</h3>
      <EnemyThresholdPieSvg distribution={item.distribution} countMode={countMode} labelLayout={labelLayout}
        width={cardWidth} height={imageBodyHeight(labelLayout)} reserveMissingFooter={series.some(({ missingCount }) => missingCount > 0)} image />
    </section>)}
    {!series.length && <p className="enemy-threshold-pie-image-empty">表示する比較条件がありません</p>}
  </div>
}

import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import type { EnemyRecord } from '../types/enemy'
import type { EnemyComparisonCondition } from '../lib/enemyDistributionComparison'
import type { EnemyThresholdComparison, EnemyThresholdComparisonSeries } from '../lib/enemyThresholdComparison'
import type { EnemyThresholdBarLayout } from '../lib/enemyThresholdBarLayout'
import { ENEMY_HISTOGRAM_COUNT_MODES, type EnemyHistogramCountMode } from '../lib/enemyHistogramCounts'
import { ENEMY_THRESHOLD_BUCKET_COLORS } from '../lib/enemyThresholdColors'
import { ChartImageFrame } from './ChartImageFrame'
import { EnemyComparisonConditions } from './EnemyComparisonConditions'
import './EnemyThresholdBarComparison.css'

interface ThresholdBarProps {
  comparison: EnemyThresholdComparison
  countMode: EnemyHistogramCountMode
  labelLayout: EnemyThresholdBarLayout
}

const formatCount = (count: number) => count.toLocaleString('ja-JP')
const formatPercent = (proportion: number) => `${(proportion * 100).toFixed(1)}%`
const visibleSeries = (comparison: EnemyThresholdComparison) => comparison.series.filter(({ condition }) => condition.visible)
const categories = (threshold: number) => [
  { key: 'BELOW' as const, label: `${threshold}未満` },
  { key: 'EQUAL' as const, label: `${threshold}と同じ` },
  { key: 'ABOVE' as const, label: `${threshold}超` },
]

function ThresholdLegend({ threshold, image = false }: { threshold: number; image?: boolean }) {
  return <ul className={image ? 'chart-image-frame-legend-list' : 'enemy-threshold-bar-legend'} aria-label="術耐性の区分">
    {categories(threshold).map(({ key, label }) => <li key={key} className={image ? 'chart-image-frame-legend-item' : undefined}>
      {image ? <svg className="chart-image-frame-legend-swatch" width="18" height="12" aria-hidden="true">
        <rect x="0" y="3" width="18" height="6" fill={ENEMY_THRESHOLD_BUCKET_COLORS[key]} />
      </svg> : <i style={{ backgroundColor: ENEMY_THRESHOLD_BUCKET_COLORS[key] }} aria-hidden="true" />}
      <span>{label}</span>
    </li>)}
  </ul>
}

export function EnemyThresholdBarComparison({ rows, comparison, countMode, labelLayout, onConditionsChange }: ThresholdBarProps & {
  rows: readonly EnemyRecord[]
  onConditionsChange: (conditions: EnemyComparisonCondition[]) => void
}) {
  const titleId = useId()
  return <div className="enemy-threshold-bar-comparison">
    <EnemyComparisonConditions rows={rows} conditions={comparison.series.map(({ condition }) => condition)}
      series={comparison.series} onChange={onConditionsChange} countMode={countMode}
      showSeriesSwatch={false} showCountsInSummary={false} />
    <figure className="enemy-analysis-figure enemy-threshold-bar-figure" aria-labelledby={titleId}>
      <figcaption><strong id={titleId}>術耐性の構成比</strong><ThresholdLegend threshold={comparison.threshold} /></figcaption>
      <ThresholdBarChart comparison={comparison} countMode={countMode} labelLayout={labelLayout} />
    </figure>
  </div>
}

function PercentAxis() {
  return <div className="enemy-threshold-bar-axis" aria-label="割合の目盛り 0から100%">
    {[0, 25, 50, 75, 100].map((percent) => <span key={percent}>{percent}%</span>)}
  </div>
}

function BucketStatistics({ series, unit }: { series: EnemyThresholdComparisonSeries; unit: string }) {
  return <dl className="enemy-threshold-bar-statistics" aria-label={`${series.label}の区分別割合と件数`}>
    {series.distribution.buckets.map((bucket) => <div key={bucket.key} data-threshold-bar-value={bucket.key}>
      <dt><i style={{ backgroundColor: ENEMY_THRESHOLD_BUCKET_COLORS[bucket.key] }} aria-hidden="true" />{bucket.label}</dt>
      <dd><span className="enemy-threshold-bar-percent" data-bar-label-key={bucket.key} data-bar-label-part="percent">{formatPercent(bucket.proportion)}</span>
        <span className="enemy-threshold-bar-count" data-bar-label-key={bucket.key} data-bar-label-part="count">{formatCount(bucket.count)}{unit}</span></dd>
    </div>)}
  </dl>
}

function ThresholdBarRow({ series, countMode, labelLayout }: {
  series: EnemyThresholdComparisonSeries
  countMode: EnemyHistogramCountMode
  labelLayout: EnemyThresholdBarLayout
}) {
  const titleId = useId()
  const unit = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === countMode)!.unit
  const description = series.count === 0 ? `${series.label}。集計できる敵がありません`
    : `${series.label}。${series.distribution.buckets.map((bucket) => `${bucket.label}：${formatPercent(bucket.proportion)}、${formatCount(bucket.count)}${unit}`).join('。')}`
  const largest = series.distribution.buckets.reduce((current, bucket) => bucket.proportion > current.proportion ? bucket : current)
  return <section className="enemy-threshold-bar-row" aria-labelledby={titleId} data-threshold-bar-series={series.condition.id}
    data-threshold-bar-condition={series.condition.id}>
    <div className="enemy-threshold-bar-main">
      <div className="enemy-threshold-bar-row-heading">
        <h4 id={titleId}>{series.label}</h4>
        <div className="enemy-threshold-bar-summary">
          <span>合計 {formatCount(series.count)}{unit}</span>
          {series.missingCount > 0 && <span>術耐性不明 {formatCount(series.missingCount)}{unit}を除外</span>}
        </div>
      </div>
      <div className="enemy-threshold-bar-track" role="img" aria-label={description}>
        {series.distribution.buckets.map((bucket) => <span key={bucket.key} className="enemy-threshold-bar-segment"
          data-threshold-bar-bucket={bucket.key} data-threshold-bar-proportion={bucket.proportion}
          data-bar-segment={bucket.key} data-bar-proportion={bucket.proportion}
          style={{ width: `${bucket.proportion * 100}%`, backgroundColor: ENEMY_THRESHOLD_BUCKET_COLORS[bucket.key] }}
          title={`${bucket.label}：${formatPercent(bucket.proportion)}、${formatCount(bucket.count)}${unit}`}>
          {labelLayout === 'AXIS' && bucket.key === largest.key && bucket.proportion >= .35
            ? <span aria-hidden="true">{formatPercent(bucket.proportion)}</span> : null}
        </span>)}
        {series.count === 0 && <span className="enemy-threshold-bar-empty-track">集計できる敵がありません</span>}
      </div>
    </div>
    <BucketStatistics series={series} unit={unit} />
  </section>
}

function ThresholdBarChart({ comparison, countMode, labelLayout, width, height, onNaturalHeight }: ThresholdBarProps & {
  width?: number
  height?: number
  onNaturalHeight?: (height: number) => void
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const series = visibleSeries(comparison)
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content || !onNaturalHeight) return
    const measure = () => onNaturalHeight(Math.ceil(content.offsetHeight))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [comparison, labelLayout, onNaturalHeight])
  return <div className={`enemy-threshold-bars enemy-threshold-bar-chart enemy-threshold-bars-${labelLayout.toLowerCase()}`}
    data-threshold-bar-layout={labelLayout} style={{ width, minHeight: height }}>
    <div className="enemy-threshold-bar-content" ref={contentRef}>
      <div className="enemy-threshold-bar-chart-heading">
        <PercentAxis />
        {labelLayout === 'RIGHT' && <div className="enemy-threshold-bar-column-headings" aria-hidden="true">
          {categories(comparison.threshold).map(({ key, label }) => <span key={key}>
            <i style={{ backgroundColor: ENEMY_THRESHOLD_BUCKET_COLORS[key] }} />{label}</span>)}
        </div>}
      </div>
      {series.map((item) => <ThresholdBarRow key={item.condition.id} series={item} countMode={countMode} labelLayout={labelLayout} />)}
      {!series.length && <p className="enemy-threshold-bar-empty">表示する比較条件がありません</p>}
    </div>
  </div>
}

/** Reserve the bars and outside values; measured condition wrapping can grow this height. */
export function getEnemyThresholdBarComparisonNaturalHeight(comparison: EnemyThresholdComparison, labelLayout: EnemyThresholdBarLayout) {
  const series = visibleSeries(comparison)
  if (!series.length) return 64
  const titleWidth = labelLayout === 'RIGHT' ? 480 : 700
  const baseRowHeight = labelLayout === 'RIGHT' ? 84 : 152
  return Math.max(334, 28 + series.reduce((height, { label }) => {
    const estimatedWidth = [...label].reduce((sum, character) => sum + (/^[\x00-\x7f]$/.test(character) ? .65 : 1), 0) * 12
    return height + baseRowHeight + Math.max(0, Math.ceil(estimatedWidth / titleWidth) - 1) * 20
  }, 0))
}

export function EnemyThresholdBarComparisonImage({ comparison, countMode, labelLayout, aspectRatio, onLayout }: ThresholdBarProps & {
  aspectRatio?: number
  onLayout?: (size: { width: number; height: number }) => void
}) {
  const [naturalHeight, setNaturalHeight] = useState(() => getEnemyThresholdBarComparisonNaturalHeight(comparison, labelLayout))
  const measureHeight = useCallback((height: number) => setNaturalHeight((current) => Math.max(current, height)), [])
  const mode = ENEMY_HISTOGRAM_COUNT_MODES.find(({ key }) => key === countMode)!
  return <ChartImageFrame className="enemy-chart-image enemy-threshold-bar-comparison-image"
    title="敵の術耐性の構成比" legend={<ThresholdLegend threshold={comparison.threshold} image />}
    conditions={`基準の術耐性 ${String(comparison.threshold)} · ${mode.label}`} axisTitle="割合（%）"
    naturalChartHeight={naturalHeight} aspectRatio={aspectRatio} onLayout={onLayout}>
    {({ width, height }) => <ThresholdBarChart comparison={comparison} countMode={countMode} labelLayout={labelLayout}
      width={width} height={height} onNaturalHeight={measureHeight} />}
  </ChartImageFrame>
}
